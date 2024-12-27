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

type AuthMiddleware struct {
	handler http.Handler
}

func (h *AuthMiddleware) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	log.Println("check auth")
	authorized := checkAuthorization(r)
	log.Printf("Authorized? %v", authorized)
	if !authorized {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	h.handler.ServeHTTP(w, r)
}

func NewAuthMiddleware(next http.Handler) http.Handler {
	return &AuthMiddleware{next}
}

type IndexHandler struct{}

func (h *IndexHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	fmt.Println(r.URL.Path)

	switch {
	case r.Method == http.MethodPost && r.URL.Path == "/login":
		h.login(w, r)
	case r.Method == http.MethodGet && r.URL.Path == "/protected":
		NewAuthMiddleware(http.HandlerFunc(h.protectedResource)).ServeHTTP(w, r)
	default:
		fmt.Fprintf(w, "called /")
	}
}

func handleCors(w *http.ResponseWriter) {
	(*w).Header().Set("Access-Control-Allow-Origin", "*")
}

type LoginResponse struct {
	Response string `json:"response"`
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
		log.Printf("Failed to read credentials: %v", err)
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
		log.Printf("Failed to query")
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
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(LoginResponse{"Authenticated!"})
}

func checkAuthorization(r *http.Request) bool {
	// Check session token.
	authHeader := r.Header.Get("Authentication")
	if authHeader == "" {
		log.Printf("Failed to read authentication header: Authentication header does not exist.")
		return false
	}

	splitAuthHeader := strings.Split(authHeader, "Bearer ")
	if len(splitAuthHeader) == 1 && splitAuthHeader[0] == authHeader {
		log.Printf("Failed to read authentication header: Authentication header does not include Bearer.")
		return false
	}

	sessionToken := splitAuthHeader[1]
	log.Printf("sessionToken: %v", sessionToken)

	// Check in the database to see if this matches.
	queryStr := "SELECT username FROM users WHERE session_token = $1;"
	var username string
	err := db.QueryRow(queryStr, sessionToken).Scan(&username)

	// if no match, error out
	if err == sql.ErrNoRows {
		log.Println("Invalid credentials")
		return false
	}

	if err != nil {
		log.Printf("Failed to query: %v", err)
		return false
	}

	// if match, check the matched user's role
	queryStr = "SELECT role FROM users WHERE username = $1;"
	var role string
	err = db.QueryRow(queryStr, username).Scan(&role)
	if err == sql.ErrNoRows {
		log.Println("User has no roles assigned.")
		return false
	}

	if err != nil {
		log.Printf("Failed to query: %v", err)
		return false
	}

	// check if the user can perform this action
	if role == "user" {
		return true
	} else {
		log.Println("Unauthorized")
		return false
	}
}

func (h *IndexHandler) protectedResource(w http.ResponseWriter, r *http.Request) {
	type Response struct {
		Message string `json:"message"`
	}
	json.NewEncoder(w).Encode(Response{"super secret"})
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
		"session_token TEXT UNIQUE,",
		"role TEXT",
		")",
	}, "")
	_, err = db.Exec(queryStr)
	if err != nil {
		log.Fatalf("Failed to create table: %v", err)
	}

	queryStr = strings.Join([]string{
		`INSERT INTO users (username, pw_hash, role) VALUES ("user1", "$2a$10$WCdbhD2HDUsqO7b3bD/RwekiV8e/2xacF.anrualxypMS7WgpitWe", "user")`,
	}, "")
	_, err = db.Exec(queryStr)
	if err != nil {
		log.Fatalf("Failed to insert user, %v", err)
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
