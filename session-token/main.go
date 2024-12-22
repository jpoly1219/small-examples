package main

import (
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	_ "github.com/mattn/go-sqlite3"
	"golang.org/x/crypto/bcrypt"
)

var db *sql.DB

func generateToken(length int) (string, error) {
	randomBytes := make([]byte, length)
	_, err := rand.Read(randomBytes)
	if err != nil {
		return "", err
	}
	return hex.EncodeToString(randomBytes), nil
}

type IndexHandler struct{}

func (h *IndexHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	fmt.Println(r.URL.Path)

	switch {
	case r.Method == http.MethodPost && r.URL.Path == "/login":
		h.login(w, r)
	case r.Method == http.MethodPost && r.URL.Path == "/protected":
		h.protected(w, r)
	default:
		fmt.Fprintf(w, "called /")
	}
}

func handleCors(w *http.ResponseWriter) {
	(*w).Header().Set("Access-Control-Allow-Origin", "*")
}

func (h *IndexHandler) login(w http.ResponseWriter, r *http.Request) {
	handleCors(&w)

	// check username and password
	type Credentials struct {
		Username string `json:"username"`
		Password string `json:"password"`
	}

	var cred Credentials

	d := json.NewDecoder(r.Body)
	d.DisallowUnknownFields()
	err := d.Decode(&cred)
	if err != nil {
		log.Println("Failed to read credentials")
		http.Error(w, "Failed to read credentials", http.StatusInternalServerError)
		return
	}

	// pwHash, err := bcrypt.GenerateFromPassword([]byte(cred.Password), bcrypt.DefaultCost)
	// if err != nil {
	// 	log.Println("Failed to create password hash")
	// 	http.Error(w, "Failed to create passowrd hash", http.StatusInternalServerError)
	// 	return
	// }

	// check in the database to see if this matches
	type UserModel struct {
		Username      string
		Pw_hash       string
		Session_token sql.NullString
	}

	var user UserModel

	queryStr := strings.Join([]string{
		"SELECT username, pw_hash, session_token FROM users WHERE username = $1;",
		// "SELECT username, pw_hash FROM users WHERE username = ?;",
	}, "")

	err = db.QueryRow(queryStr, cred.Username).Scan(&user.Username, &user.Pw_hash, &user.Session_token)

	// if no match, error out
	if err == sql.ErrNoRows {
		log.Println("Invalid credentials")
		http.Error(w, "Invalid credentials", http.StatusBadRequest)
		return
	}

	if err != nil {
		log.Println("Failed to query")
		http.Error(w, "Failed to query", http.StatusInternalServerError)
		return
	}

	err = bcrypt.CompareHashAndPassword([]byte(user.Pw_hash), []byte(cred.Password))
	if err != nil {
		log.Println("Invalid credentials")
		http.Error(w, "Invalid credentials", http.StatusBadRequest)
		return
	}

	// if match, generate a session token
	token, err := generateToken(32)
	if err != nil {
		log.Printf("Failed to generate session token: %v\n", err)
		http.Error(w, "Failed to generate session token", http.StatusInternalServerError)
		return
	}

	// save token
	queryStr = strings.Join([]string{
		"UPDATE users SET session_token = $1 WHERE username = $2;",
	}, "")
	res, err := db.Exec(queryStr, token, cred.Username)
	if err != nil {
		log.Println("Failed to save session token")
		http.Error(w, "Failed to save session token", http.StatusInternalServerError)
		return
	}
	a, _ := res.RowsAffected()
	b, _ := res.LastInsertId()
	fmt.Printf("%v, %v\n", a, b)

	// send back the session token in the cookie
	cookie := &http.Cookie{
		Name:     "aceai-session-token",
		Value:    token,
		Path:     "/",
		MaxAge:   86400,
		HttpOnly: true,
		Secure:   true,
		SameSite: http.SameSiteLaxMode,
	}

	http.SetCookie(w, cookie)
	w.Write([]byte("Authenticated!"))
}

func (h *IndexHandler) protected(w http.ResponseWriter, r *http.Request) {
	handleCors(&w)

	// check session token
	// check in the database to see if this matches
	// if match, check the matched user's role
	// check if the user can perform this action
}

func main() {
	os.Remove(filepath.Join(".", "database.db"))

	file, err := os.Create("./database.db")
	if err != nil {
		log.Fatal(err)
	}
	file.Close()

	db, err = sql.Open("sqlite3", "./database.db")
	if err != nil {
		log.Fatal(err)
	}
	defer db.Close()

	queryStr := strings.Join([]string{
		"CREATE TABLE IF NOT EXISTS users (",
		"username TEXT PRIMARY KEY,",
		"pw_hash TEXT UNIQUE NOT NULL,",
		"session_token TEXT UNIQUE",
		")",
	}, "")
	_, err = db.Exec(queryStr)
	if err != nil {
		log.Fatalf("Failed to create table: %v", err)
	}

	queryStr = strings.Join([]string{
		`INSERT INTO users (username, pw_hash) VALUES ("user1", "$2a$10$WCdbhD2HDUsqO7b3bD/RwekiV8e/2xacF.anrualxypMS7WgpitWe")`,
	}, "")
	_, err = db.Exec(queryStr)
	if err != nil {
		log.Fatal("Failed to insert user")
	}

	// pwHash, err := bcrypt.GenerateFromPassword([]byte("password"), bcrypt.DefaultCost)
	// if err != nil {
	// 	log.Println("Failed to create password hash")
	// 	return
	// }
	// log.Println(string(pwHash))

	mux := http.NewServeMux()
	mux.Handle("/", &IndexHandler{})

	http.ListenAndServe(":8080", mux)
}
