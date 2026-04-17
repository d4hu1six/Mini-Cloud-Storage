```md
# ☁️ Mini Cloud Storage

A simple web-based cloud storage application that allows users to upload, manage, and access their files online. This project demonstrates the core functionality of modern cloud storage systems in a lightweight and beginner-friendly way.

---

## 🚀 Features

- User Authentication (Login / Signup)
- File Upload
- File Download
- File Deletion
- View Uploaded Files
- Star and Trash functionality (optional)

---

## 🛠️ Tech Stack

- **Frontend:** HTML, CSS, JavaScript  
- **Backend:** Node.js, Express.js  
- **Database:** JSON Server (`db.json`)  
- **File Handling:** Multer  

---

## 📁 Project Structure

```

Mini-Cloud-Storage/
│
├── index.html
├── server.js
├── db.json
├── data.json
├── package.json
└── uploads/

````

---

## ⚙️ Installation & Setup

### 1. Clone the repository

```bash
git clone https://github.com/d4hu1six/Mini-Cloud-Storage.git
cd Mini-Cloud-Storage
````

---

### 2. Install dependencies

```bash
npm install
```

---

### 3. Start JSON Server (Database)

```bash
npx json-server --watch db.json --port 3000
```

---

### 4. Start Backend Server

```bash
node server.js
```

---

### 5. Open in Browser

```
http://localhost:3000
```

---

## 🧠 How It Works

* Users register and log in to the system
* Files are uploaded using Multer
* Uploaded files are stored in the `/uploads` directory
* File metadata is stored in `db.json`
* Users can view, download, or delete their files

---

## ⚠️ Limitations

* Uses local storage instead of real cloud services
* Basic authentication (no advanced security)
* No file sharing functionality
* Limited scalability

---

## 🔮 Future Improvements

* Integration with AWS S3 or Firebase Storage
* Folder management system
* File sharing via links
* Improved authentication using JWT
* Responsive and enhanced UI

---

## 👨‍💻 Author

Dhruv Sharma

---

## 📌 Note

This project is intended for educational and learning purposes.

```
```
