// script.js (module)
import { db, auth } from "./firebase.js"; // <-- Updated to import 'auth'

import {
  collection,
  doc,
  setDoc,
  getDocs,
  query,
  where,
  getDoc // <-- NEW: Used to fetch a single user's role document
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";

import { // <-- NEW: Firebase Auth functions
    signInWithEmailAndPassword,
    signOut,
    onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";

let attendanceData = {};
let students = [];
let currentClass = null;
let currentUserRole = null; // <-- NEW: Global variable for user role

// --- AUTHENTICATION & UI LOGIC ---

function updateUI(role) {
    const loginScreen = document.getElementById("loginScreen");
    const appScreen = document.getElementById("appScreen");
    const classSelect = document.getElementById("classSelect");
    
    if (role) {
        // User is logged in, show the main app
        loginScreen.classList.add("hidden");
        appScreen.classList.remove("hidden");
        
        // Example of role-specific restriction: Only Admins can change class
        // You can add more complex restrictions here
        if (role === 'admin') {
             // You might want to remove a lock if you add one later
        } else if (role === 'teacher') {
            // Teacher logic can go here (e.g., they can only see classes assigned to them)
        }
    } else {
        // User is logged out, show the login screen
        loginScreen.classList.remove("hidden");
        appScreen.classList.add("hidden");
        
        // Clean up UI elements when logged out
        document.getElementById("studentTable").classList.add("hidden");
        document.getElementById("saveBtn").classList.add("hidden");
        document.getElementById("studentDataDisplay").classList.add("hidden");
    }
}

window.handleLogin = async function () {
    const email = document.getElementById("loginEmail").value;
    const password = document.getElementById("loginPassword").value;
    const msg = document.getElementById("loginMessage");
    
    msg.textContent = "";
    
    try {
        // Firebase function to sign in
        await signInWithEmailAndPassword(auth, email, password);
        // Success is handled by the onAuthStateChanged listener below
        msg.textContent = "Login Successful!";
        msg.style.color = "#2ecc71";
    } catch (error) {
        // Handle login errors
        let errorMessage = "Login Failed. Invalid Credentials or Network Error.";
        if (error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password') {
            errorMessage = "Invalid email or password.";
        }
        msg.textContent = errorMessage;
        msg.style.color = "#e74c3c";
        console.error("Login Error:", error);
    }
};

window.handleLogout = function () {
    // Firebase function to sign out
    signOut(auth).then(() => {
        // Sign-out successful. The listener handles the UI update.
        currentUserRole = null;
    }).catch((error) => {
        alert("Logout failed: " + error.message);
    });
};

async function checkUserRole(user) {
    if (!user) {
        currentUserRole = null;
        updateUI(null);
        return;
    }

    try {
        // Fetch the user's role document from the 'users' collection
        const userDocRef = doc(db, "users", user.uid);
        const userDoc = await getDoc(userDocRef);
        
        if (userDoc.exists() && userDoc.data().role) {
            currentUserRole = userDoc.data().role;
            console.log(`User logged in with role: ${currentUserRole}`);
            updateUI(currentUserRole);
        } else {
            // User exists in Auth but is not authorized (no role document)
            alert("Your account is not authorized. Logging out.");
            await handleLogout();
        }
    } catch (error) {
        console.error("Error fetching user role:", error);
        alert("An error occurred while checking permissions. Logging out.");
        await handleLogout();
    }
}

// Initializer: Checks login status and sets up listener for all login/logout events
onAuthStateChanged(auth, (user) => {
    checkUserRole(user);
});


// -----------------------------------------------------------------
// --- EXISTING ATTENDANCE LOGIC (KEPT INTACT) ---
// -----------------------------------------------------------------


// --- Populate the class dropdown ---
function populateClassDropdown() {
  const select = document.getElementById("classSelect");
  if (!select) return;

  const classOrder = [
    "Nursery", "Lkg", "Lkg - A", "Lkg - B", "Ukg",
    "First", "Second", "Third", "Fourth"
  ];

  select.innerHTML = '<option value="" selected disabled>-- Select Class --</option>';

  classOrder.forEach(className => {
    const option = document.createElement('option');
    option.value = className; 
    option.textContent = className; 
    select.appendChild(option);
  });
}

// Load students.json
fetch("./students.json")
  .then(res => res.json())
  .then(data => {
    students = data;
    populateClassDropdown();
  })
  .catch(err => console.error("Error loading student data:", err));

window.loadClassStudents = function () {
  // Check if user is logged in before allowing action
  if (!currentUserRole) return alert("Please log in first.");

  const classSelect = document.getElementById("classSelect");
  const selectedClass = classSelect.value;
  
  if (!selectedClass) return alert("Please select a class");

  currentClass = selectedClass;

  const classStudents = students.filter(s => s.class === currentClass);

  if (classStudents.length === 0) return alert(`No students found for class: ${currentClass}`);

  document.getElementById("studentTable").classList.remove("hidden");
  document.getElementById("saveBtn").classList.remove("hidden");
  document.getElementById("studentDataDisplay").classList.add("hidden"); // Hide history when loading students

  const tbody = document.getElementById("studentBody");
  tbody.innerHTML = "";
  attendanceData = {}; // Clear attendance data for the new class

  classStudents.forEach(stu => {
    attendanceData[stu.id] = {
      studentId: stu.id,
      name: stu.name,
      status: "Present",
      comment: "",
      date: new Date().toLocaleDateString(),
      class: currentClass
    };

    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${stu.id}</td>
      <td>${stu.name}</td>
      <td>
        <input type="radio" id="present-${stu.id}" name="status-${stu.id}" value="Present" checked onclick="updateStatus(${stu.id}, 'Present')">
        <label for="present-${stu.id}">Present</label>
        <input type="radio" id="absent-${stu.id}" name="status-${stu.id}" value="Absent" onclick="updateStatus(${stu.id}, 'Absent')">
        <label for="absent-${stu.id}">Absent</label>
      </td>
      <td>
        <input type="text" id="comment-${stu.id}" placeholder="Comment" oninput="updateComment(${stu.id})">
      </td>
    `;
    tbody.appendChild(row);
  });
};

window.updateStatus = function (id, status) {
  const commentInput = document.getElementById(`comment-${id}`);
  attendanceData[id].status = status;
  
  if (status === "Absent") {
    commentInput.value = "";
    commentInput.disabled = true;
    attendanceData[id].comment = "";
  } else {
    commentInput.disabled = false;
    attendanceData[id].comment = commentInput.value;
  }
};

window.updateComment = function (id) {
  if (attendanceData[id].status === "Present") {
    attendanceData[id].comment = document.getElementById(`comment-${id}`).value;
  }
};

// SAVE TO FIRESTORE
window.saveAttendance = async function () {
  if (!currentUserRole) return alert("Please log in to save attendance.");

  const today = new Date().toLocaleDateString();

  for (let id of Object.keys(attendanceData)) {
    const record = attendanceData[id];
    
    if (!record.class) {
      record.class = currentClass;
    }

    await setDoc(doc(db, "attendance", `${id}_${today.replace(/\//g, '-')}`), record);
  }

  alert("Attendance Saved Online Successfully!");
};

// LOAD HISTORY FROM FIRESTORE
window.loadStudentData = async function () {
  if (!currentUserRole) return alert("Please log in to view student history.");
  
  const id = prompt("Enter Student ID:");
  if (!id) return;

  const q = query(collection(db, "attendance"), where("studentId", "==", parseInt(id)));
  const results = await getDocs(q);

  const div = document.getElementById("studentDataDisplay");
  div.classList.remove("hidden");
  document.getElementById("studentTable").classList.add("hidden");
  document.getElementById("saveBtn").classList.add("hidden");
  
  div.innerHTML = `<h2>Attendance History for ID: ${id}</h2>`;

  if (results.empty) {
    div.innerHTML += `<p>No attendance records found.</p>`;
    return;
  }

  results.forEach(docSnap => {
    const rec = docSnap.data();

    const block = document.createElement('div');
    block.innerHTML = `
      <p><strong>Date:</strong> ${rec.date}</p>
      <p><strong>Class:</strong> ${rec.class || 'N/A'}</p>
      <p><strong>Status:</strong> ${rec.status}</p>
      ${rec.comment ? `<p><strong>Comment:</strong> ${rec.comment}</p>` : ''}
      <hr>
    `;
    div.appendChild(block);
  });
};