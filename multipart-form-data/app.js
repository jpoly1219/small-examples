document.getElementById('uploadForm').addEventListener('submit', async (event) => {
  event.preventDefault();

  const fileInput = document.getElementById('csvFile');
  const file = fileInput.files[0];

  if (!file) {
    document.getElementById('status').innerText = "Please select a file.";
    return;
  }

  const formData = new FormData();
  formData.append('input_dataset', file);

  try {
    document.getElementById('status').innerText = "Uploading...";

    const response = await fetch('http://localhost:8080/uploadStream', {
      method: 'POST',
      body: formData,
    });

    if (response.ok) {
      const result = await response.text();
      document.getElementById('status').innerText = `Upload successful! Server response: ${result}`;
    } else {
      document.getElementById('status').innerText = `Upload failed. Status: ${response.status}`;
    }
  } catch (error) {
    console.error('Error uploading file:', error);
    document.getElementById('status').innerText = "An error occurred during the upload.";
  }
});
