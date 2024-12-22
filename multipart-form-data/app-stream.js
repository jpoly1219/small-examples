document.getElementById('uploadForm').addEventListener('submit', async (event) => {
  event.preventDefault();

  const fileInput = document.getElementById('csvFile');
  const file = fileInput.files[0];

  if (!file) {
    document.getElementById('status').innerText = "Please select a file.";
    return;
  }

  const chunkSize = 5 * 1024 * 1024; // 5 MB chunks
  const totalChunks = Math.ceil(file.size / chunkSize);
  const progressBar = document.getElementById('progressBar');
  let uploadedChunks = 0;

  document.getElementById('status').innerText = "Uploading...";
  progressBar.value = 0;

  console.log(totalChunks)

  for (let start = 0; start < file.size; start += chunkSize) {
    const chunk = file.slice(start, start + chunkSize);
    const chunkIndex = Math.floor(start / chunkSize);

    console.log(`${chunkIndex}, ${chunk}, ${start}`)

    const formData = new FormData();
    formData.append('chunkIndex', chunkIndex.toString());
    formData.append('totalChunks', totalChunks.toString());
    formData.append('fileName', file.name);
    formData.append('chunk', chunk);
    // console.log(JSON.stringify(formData))

    try {
      const response = await fetch('http://localhost:8080/uploadStream', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`Failed to upload chunk ${chunkIndex}`);
      }

      uploadedChunks++;
      progressBar.value = (uploadedChunks / totalChunks) * 100;
      await new Promise(resolve => setTimeout(resolve, 100))
     } catch (error) {
      console.error('Error uploading file:', error);
      document.getElementById('status').innerText = "An error occurred during the upload.";
      start -= chunkSize;
    }
  }

  document.getElementById('status').innerText = "Upload complete!";
});
