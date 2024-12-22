package main

import (
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
)

type IndexHandler struct{}

func (h *IndexHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	fmt.Println(r.URL.Path)

	switch {
	case r.Method == http.MethodPost && r.URL.Path == "/upload":
		h.upload(w, r)
	case r.Method == http.MethodPost && r.URL.Path == "/uploadStream":
		h.uploadStream(w, r)
	default:
		fmt.Fprintf(w, "called /")
	}
}

func handleCors(w *http.ResponseWriter) {
	(*w).Header().Set("Access-Control-Allow-Origin", "*")
}

func (h *IndexHandler) upload(w http.ResponseWriter, r *http.Request) {
	handleCors(&w)

	err := r.ParseMultipartForm(10 << 20) // 10 GB
	if err != nil {
		log.Printf("Unable to parse form")
		http.Error(w, "Unable to parse form", http.StatusBadRequest)
		return
	}

	file, handler, err := r.FormFile("input_dataset")
	if err != nil {
		log.Printf("Error retrieving input dataset")
		http.Error(w, "Error retrieving input dataset", http.StatusBadRequest)
		return
	}
	defer file.Close()

	log.Printf("Uploaded File: %+v\n", handler.Filename)
	log.Printf("File Size: %+v\n", handler.Size)
	log.Printf("MIME Header: %+v\n", handler.Header)

	clientRoot := filepath.Join(".", "client")
	clientInputDatasetsRoot := filepath.Join(clientRoot, "input-datasets")
	if _, err := os.Stat(clientInputDatasetsRoot); os.IsNotExist(err) {
		err := os.MkdirAll(clientInputDatasetsRoot, 0755)
		if err != nil {
			log.Printf("Failed to create the input dataset root", err)
			http.Error(w, "Failed to create the input dataset root", http.StatusInternalServerError)
			return
		}
	} else {
		log.Printf("Failed to create the input dataset root", err)
		http.Error(w, "Failed to create the input dataset root", http.StatusInternalServerError)
		return
	}

	dest, err := os.Create(filepath.Join(clientInputDatasetsRoot, handler.Filename))
	if err != nil {
		log.Printf("Failed to create the input dataset file", err)
		http.Error(w, "Failed to create the input dataset file", http.StatusInternalServerError)
		return
	}
	defer dest.Close()

	if _, err := io.Copy(dest, file); err != nil {
		log.Printf("Failed to save the input dataset file")
		http.Error(w, "Failed to save the input dataset file", http.StatusInternalServerError)
		return
	}

	log.Println(w, "File uploaded successfully!")
	fmt.Fprintln(w, "File uploaded successfully!")
}

func (h *IndexHandler) uploadStream(w http.ResponseWriter, r *http.Request) {
	handleCors(&w)

	mr, err := r.MultipartReader()
	if err != nil {
		log.Printf("Unable to create reader")
		http.Error(w, "Unable to create reader", http.StatusInternalServerError)
		return
	}

	var (
		fileName    string
		chunkIndex  int
		totalChunks int
	)

	clientRoot := filepath.Join(".", "client")
	clientInputDatasetsRoot := filepath.Join(clientRoot, "input-datasets")
	if _, err := os.Stat(clientInputDatasetsRoot); os.IsNotExist(err) {
		err := os.MkdirAll(clientInputDatasetsRoot, 0755)
		if err != nil {
			log.Printf("Failed to create the input dataset root", err)
			http.Error(w, "Failed to create the input dataset root", http.StatusInternalServerError)
			return
		}
	}
	chunkDir := filepath.Join(clientInputDatasetsRoot, "chunks")
	if _, err := os.Stat(chunkDir); os.IsNotExist(err) {
		err := os.Mkdir(chunkDir, 0755)
		if err != nil {
			log.Printf("Failed to create the chunk directory: %s\n", err)
			http.Error(w, "Failed to create the chunk directory", http.StatusInternalServerError)
			return
		}
	}

	// for {
	part, err := mr.NextPart()
	// if err == io.EOF {
	// 	break
	// }
	if err != nil {
		log.Printf("Error reading multipart data: %s\n")
		http.Error(w, "Error reading multipart data", http.StatusInternalServerError)
		return
	}
	log.Printf("part: %v\n", part)

	switch part.FormName() {
	case "fileName":
		buf := make([]byte, 512)
		n, _ := part.Read(buf)
		fileName = string(buf[:n])
		log.Printf("fileName: %v\n", fileName)
	case "chunkIndex":
		buf := make([]byte, 512)
		n, _ := part.Read(buf)
		chunkIndex, _ = strconv.Atoi(string(buf[:n]))
		log.Printf("chunkIndex: %v\n", chunkIndex)
	case "totalChunks":
		buf := make([]byte, 512)
		n, _ := part.Read(buf)
		totalChunks, _ = strconv.Atoi(string(buf[:n]))
		log.Printf("totalChunks: %v\n", totalChunks)
	case "chunk":
		log.Println("chunk!")
		chunkPath := filepath.Join(chunkDir, strconv.Itoa(chunkIndex))
		log.Printf("chunkPath: %v\n", chunkPath)
		dest, err := os.Create(chunkPath)
		if err != nil {
			log.Printf("Failed to create chunk: %s\n", err)
			http.Error(w, "Failed to create chunk", http.StatusInternalServerError)
			return
		}

		_, err = io.Copy(dest, part)
		dest.Close()
		if err != nil {
			log.Printf("Failed to save chunk: %s\n", err)
			http.Error(w, "Failed to save chunk", http.StatusInternalServerError)
			return
		}
	}
	// }

	if chunkIndex+1 == totalChunks {
		finalPath := filepath.Join(clientInputDatasetsRoot, fileName)
		finalFile, err := os.Create(finalPath)
		if err != nil {
			log.Printf("Failed to create final file: %s\n", err)
			http.Error(w, "Failed to create final file", http.StatusInternalServerError)
			return
		}
		defer finalFile.Close()

		chunkDir := filepath.Join(clientInputDatasetsRoot, "chunks")
		for i := 0; i < totalChunks; i++ {
			chunkPath := filepath.Join(chunkDir, strconv.Itoa(i))
			chunkData, err := os.Open(chunkPath)
			if err != nil {
				log.Printf("Failed to read chunk: %s\n", err)
				http.Error(w, "Failed to read chunk", http.StatusInternalServerError)
				return
			}

			_, err = io.Copy(finalFile, chunkData)
			chunkData.Close()
			if err != nil {
				log.Printf("Failed to write to final file: %s\n", err)
				http.Error(w, "Failed to write to final file", http.StatusInternalServerError)
				return
			}
			// os.Remove(chunkPath)
		}
		// os.Remove(chunkDir)
		log.Println("File built successfully!")
		fmt.Fprintln(w, "File built successfully!")
	} else {
		log.Println("Skip")
	}

	log.Println("File uploaded successfully!")
	fmt.Fprintln(w, "File uploaded successfully!")
}

func main() {
	mux := http.NewServeMux()
	mux.Handle("/", &IndexHandler{})
	mux.Handle("/upload", &IndexHandler{})

	http.ListenAndServe(":8080", mux)
}
