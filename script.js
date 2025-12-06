// script.js (module)
import { db, auth } from "./firebase.js"; 

import {
  collection,
  doc,
  setDoc,
  getDocs,
  query,
  where,
  getDoc 
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";

import { 
    signInWithEmailAndPassword,
    signOut,
    onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js"; 

let attendanceData = {};
let students = [];
let currentClass = null;
let currentUserRole = null;
let monthlyReportData = null;

// --- DATE UTILITY FUNCTIONS (Standardized YYYY-MM-DD) ---

/**
 * Returns the current date in a standard format: YYYY-MM-DD.
 */
function getStandardDate() {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`; // e.g., "2025-12-05"
}

/**
 * Parses the YYYY-MM-DD string into its numeric components.
 */
function getNumericDateParts(dateString) {
    const parts = dateString.split('-');
    if (parts.length !== 3) return null;
    
    const year = parts[0];
    const month = String(parseInt(parts[1], 10)); // e.g., "07" -> "7"
    const day = parts[2]; 

    return { year, month, day };
}
// --- END DATE UTILITY FUNCTIONS ---


// --- UTILITY/UI FUNCTIONS ---

/**
 * Manages which main view is visible: Attendance, History, or Report.
 */
function manageViews(activeView) {
    const views = {
        attendance: document.getElementById("attendanceTakingView"),
        history: document.getElementById("studentHistoryView"),
        report: document.getElementById("reportView")
    };

    Object.keys(views).forEach(viewKey => {
        const viewElement = views[viewKey];
        if (viewElement) {
            if (viewKey === activeView) {
                viewElement.classList.remove("hidden");
            } else {
                viewElement.classList.add("hidden");
            }
        }
    });

    // Specific management for attendance table/save button (assuming elements exist)
    const studentTable = document.getElementById("studentTable");
    const saveBtn = document.getElementById("saveBtn");

    if (activeView === 'attendance' && studentTable && saveBtn) {
        if (document.getElementById("studentBody") && document.getElementById("studentBody").children.length > 0) {
            studentTable.classList.remove("hidden");
            saveBtn.classList.remove("hidden");
        } else {
             studentTable.classList.add("hidden");
             saveBtn.classList.add("hidden");
        }
    } else if (studentTable && saveBtn) {
        studentTable.classList.add("hidden");
        saveBtn.classList.add("hidden");
    }
    
    // Reset report output visibility
    const reportOutput = document.getElementById("reportOutput");
    if (reportOutput && activeView !== 'report') {
        reportOutput.classList.add("hidden");
    }
}


// --- AUTHENTICATION & UI LOGIC ---

function updateUI(role) {
    const loginScreen = document.getElementById("loginScreen");
    const appScreen = document.getElementById("appScreen");
    
    if (role) {
        // User is logged in
        if (loginScreen) loginScreen.classList.add("hidden");
        if (appScreen) appScreen.classList.remove("hidden");
        // Initialize view to Attendance when logged in
        manageViews('attendance'); 
        
        // Load student data and populate class dropdown on login
        fetch("./students.json")
          .then(res => res.json())
          .then(data => {
            students = data;
            populateClassDropdown();
            populateReportMonthYear(); // Initialize report dropdowns
          })
          .catch(err => console.error("Error loading student data:", err));
    } else {
        // User is logged out (role is null)
        // Show the login screen and hide the app screen
        if (loginScreen) loginScreen.classList.remove("hidden");
        if (appScreen) appScreen.classList.add("hidden");
        manageViews(null); // Clear all views
    }
}

/**
 * Handles user login using Firebase Auth.
 * Must be attached to the window object to be called from index.html.
 */
window.handleLogin = async function () {
    const email = document.getElementById("loginEmail") ? document.getElementById("loginEmail").value : null;
    const password = document.getElementById("loginPassword") ? document.getElementById("loginPassword").value : null;
    const msg = document.getElementById("loginMessage");
    
    if (!email || !password) {
        if (msg) {
            msg.textContent = "Please enter both email and password.";
            msg.style.color = "#e74c3c";
        }
        return;
    }
    
    if (msg) msg.textContent = "Logging in...";
    
    try {
        await signInWithEmailAndPassword(auth, email, password);
        if (msg) {
            msg.textContent = "Login Successful!";
            msg.style.color = "#2ecc71";
        }
    } catch (error) {
        let errorMessage = "Login Failed. Invalid Credentials or Network Error.";
        if (error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password') {
            errorMessage = "Invalid email or password.";
        }
        if (msg) {
            msg.textContent = errorMessage;
            msg.style.color = "#e74c3c";
        }
        console.error("Login Error:", error);
    }
};

/**
 * Handles user logout.
 */
window.handleLogout = function () {
    signOut(auth).then(() => {
        currentUserRole = null;
        // updateUI will be called by the onAuthStateChanged listener
    }).catch((error) => {
        alert("Logout failed: " + error.message);
    });
};

/**
 * Checks the user's role in the Firestore database.
 */
async function checkUserRole(user) {
    if (!user) {
        currentUserRole = null;
        updateUI(null);
        return;
    }

    try {
        const userDocRef = doc(db, "users", user.uid);
        const userDoc = await getDoc(userDocRef);
        
        if (userDoc.exists() && userDoc.data().role) {
            currentUserRole = userDoc.data().role;
            console.log(`User logged in with role: ${currentUserRole}`);
            updateUI(currentUserRole);
        } else {
            // Handle unauthorized user: log them out and show login screen
            console.warn("User account found but role is missing or unauthorized.");
            alert("Your account is not authorized. Logging out.");
            await signOut(auth);
        }
    } catch (error) {
        console.error("Error fetching user role:", error);
        alert("An error occurred while checking permissions. Logging out.");
        await signOut(auth);
    }
}

// Initializer: Checks login status and sets up listener
onAuthStateChanged(auth, (user) => {
    checkUserRole(user);
});


// -----------------------------------------------------------------
// --- APPLICATION LOGIC (Attendance, History, Report) ---
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

// --- Load Class Students for Attendance Taking ---
window.loadClassStudents = function () {
  if (!currentUserRole) return alert("Please log in first.");
  
  const classSelect = document.getElementById("classSelect");
  const selectedClass = classSelect.value;
  
  if (!selectedClass) return alert("Please select a class");
  
  currentClass = selectedClass;
  
  const classStudents = students.filter(s => s.class === currentClass);
  
  if (classStudents.length === 0) return alert(`No students found for class: ${currentClass}`);
  
  // Switch to the attendance view
  manageViews('attendance');
  
  const tbody = document.getElementById("studentBody");
  tbody.innerHTML = "";
  attendanceData = {}; // Clear previous data
  
  // Set the current date in the correct format for saving
  const todayStandard = getStandardDate();

  classStudents.forEach(stu => {
    // Check if student ID is an integer for safer comparison later
    const studentId = parseInt(stu.id);

    attendanceData[studentId] = {
      studentId: studentId,
      name: stu.name,
      status: "Present", // Default status
      comment: "",
      class: currentClass,
      date: todayStandard // Save date in standard format
    };
    
    // Determine if the comment field should be disabled on load.
    // Since default status is "Present" and we want comments for Present,
    // the field should be ENABLED by default.
    const commentDisabled = false; 

    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${studentId}</td>
      <td>${stu.name}</td>
      <td>
        <input type="radio" id="present-${studentId}" name="status-${studentId}" value="Present" checked onclick="updateStatus(${studentId}, 'Present')">
        <label for="present-${studentId}">Present</label>
        <input type="radio" id="absent-${studentId}" name="status-${studentId}" value="Absent" onclick="updateStatus(${studentId}, 'Absent')">
        <label for="absent-${studentId}">Absent</label>
      </td>
      <td>
        <input type="text" id="comment-${studentId}" placeholder="Comment" oninput="updateComment(${studentId})" ${commentDisabled ? 'disabled' : ''}>
      </td>
    `;
    tbody.appendChild(row);
  });
  
  // Show table and save button
  document.getElementById("studentTable").classList.remove("hidden");
  document.getElementById("saveBtn").classList.remove("hidden");
};


// --- UPDATE STATUS AND COMMENT ---

window.updateStatus = function (id, status) {
  const commentInput = document.getElementById(`comment-${id}`);
  
  attendanceData[id].status = status;
  
  if (status === "Present") {
    // 🟢 CORRECTION: Only enable comment for Present
    commentInput.disabled = false;
  } else {
    // Disable and clear comment for Absent
    commentInput.value = "";
    commentInput.disabled = true;
    attendanceData[id].comment = "";
  }
};

window.updateComment = function (id) {
  // 🟢 CORRECTION: Only update comment if the student is marked as Present
  if (attendanceData[id].status === "Present") {
    attendanceData[id].comment = document.getElementById(`comment-${id}`).value;
  }
};

// --- SAVE TO FIRESTORE ---
window.saveAttendance = async function () {
  if (!currentClass) return alert("Please load a class first.");
  
  const saveBtn = document.getElementById("saveBtn");
  saveBtn.textContent = "Saving...";
  saveBtn.disabled = true;
  
  // Use the standard date format (YYYY-MM-DD) for consistency
  const todayStandard = getStandardDate();

  try {
    const savePromises = Object.keys(attendanceData).map(id => {
      const record = attendanceData[id];
      // The Firestore document ID is a combination of studentId and date
      const docId = `${record.studentId}_${todayStandard}`; 
      return setDoc(doc(db, "attendance", docId), record);
    });
    
    await Promise.all(savePromises);
    
    alert(`Attendance for ${currentClass} on ${todayStandard} saved successfully!`);
  } catch (error) {
    console.error("Error saving attendance:", error);
    alert("Failed to save attendance. Check the console for details.");
  } finally {
    saveBtn.textContent = "💾 Save Attendance";
    saveBtn.disabled = false;
  }
};


// --- LOAD STUDENT HISTORY (must be window-attached) ---

/**
 * Prompts the user for a Student ID and then loads the history.
 */
window.showStudentHistoryPrompt = function() {
  if (!currentUserRole) return alert("Please log in to view student history.");
  
  // Hide all other views
  manageViews('history');
  
  const id = prompt("Enter Student ID:");
  if (!id) return;
  
  loadStudentData(id);
}

/**
 * Fetches and displays a student's attendance history.
 */
async function loadStudentData(id) {
  const historyDiv = document.getElementById("studentHistoryView");
  if (!historyDiv) return;
  historyDiv.innerHTML = `<p>Loading history for ID: ${id}...</p>`;

  try {
      // Note: Firebase `where` clause comparison should match the data type in Firestore (string vs number)
      // Since student IDs are integers, we convert the prompt input to an integer.
      const studentIdInt = parseInt(id);
      if (isNaN(studentIdInt)) {
        historyDiv.innerHTML = `<h2>Attendance History for ID: ${id}</h2><p>Invalid Student ID format.</p>`;
        return;
      }
      
      const q = query(collection(db, "attendance"), where("studentId", "==", studentIdInt)); 
      const results = await getDocs(q);

      historyDiv.innerHTML = `<h2>Attendance History for ID: ${id}</h2>`;

      if (results.empty) {
        historyDiv.innerHTML += `<p>No attendance records found.</p>`;
        return;
      }
      
      let htmlContent = '<div class="history-list">';
      
      results.forEach(docSnap => {
        const rec = docSnap.data();
        
        // Use the standard date format, or fall back for old data
        const displayDate = rec.date || 'N/A (Old Format)';

        htmlContent += `
          <div class="history-record">
            <p><strong>Date:</strong> ${displayDate}</p>
            <p><strong>Class:</strong> ${rec.class || 'N/A'}</p>
            <p><strong>Status:</strong> <span class="status-${rec.status.toLowerCase()}">${rec.status}</span></p>
            ${rec.comment ? `<p><strong>Comment:</strong> ${rec.comment}</p>` : ''}
          </div>
        `;
      });
      
      htmlContent += '</div>';
      historyDiv.appendChild(historyDiv.firstChild); // Keep the header
      historyDiv.innerHTML += htmlContent;

  } catch (error) {
      console.error("Error fetching student history:", error);
      historyDiv.innerHTML = `<h2>Attendance History for ID: ${id}</h2><p>An error occurred while loading history.</p>`;
  }
}

// --- MONTHLY REPORT FUNCTIONS ---

/**
 * Shows the report view, ensuring a class is selected first.
 */
window.showReportView = function() {
    if (!currentUserRole) return alert("Please log in to view reports.");
    
    const classSelect = document.getElementById("classSelect");
    
    // Check if a class is selected in the main dropdown
    if (!classSelect || !classSelect.value) {
      // Direct message to user about the class selection
      return alert("Please select a class from the main dropdown before generating a report.");
    }

    // Set the currentClass based on the selected value, allowing report generation to proceed.
    currentClass = classSelect.value;

    manageViews('report');
}

/**
 * Populates the month and year dropdowns for the report view.
 */
function populateReportMonthYear() {
    const monthSelect = document.getElementById("reportMonthSelect");
    const yearSelect = document.getElementById("reportYearSelect");
    
    if (!monthSelect || !yearSelect) return;

    // Clear previous options
    monthSelect.innerHTML = '<option value="" selected disabled>-- Select Month --</option>';
    yearSelect.innerHTML = '<option value="" selected disabled>-- Select Year --</option>';
    
    const months = [
        { name: "January", val: "1" }, { name: "February", val: "2" }, 
        { name: "March", val: "3" }, { name: "April", val: "4" }, 
        { name: "May", val: "5" }, { name: "June", val: "6" }, 
        { name: "July", val: "7" }, { name: "August", val: "8" }, 
        { name: "September", val: "9" }, { name: "October", val: "10" }, 
        { name: "November", val: "11" }, { name: "December", val: "12" }
    ];

    months.forEach(m => {
        const option = document.createElement('option');
        option.value = m.val;
        option.textContent = m.name;
        monthSelect.appendChild(option);
    });

    const currentYear = new Date().getFullYear();
    for (let year = currentYear; year >= currentYear - 2; year--) {
        const option = document.createElement('option');
        option.value = year.toString();
        option.textContent = year.toString();
        yearSelect.appendChild(option);
    }
}


// --- GENERATE MONTHLY REPORT (with Debugging) ---

window.generateMonthlyReport = async function() {
    if (!currentUserRole) return alert("Please log in first.");
    
    const monthSelect = document.getElementById("reportMonthSelect");
    const yearSelect = document.getElementById("reportYearSelect");
    const outputDiv = document.getElementById("reportOutput");
    const tableContainer = document.getElementById("monthlyReportTableContainer");

    const selectedMonth = monthSelect.value;
    const selectedYear = yearSelect.value;
    // Uses currentClass, which is now set in showReportView()
    const selectedClass = currentClass; 

    if (!selectedClass || !selectedMonth || !selectedYear) {
        return alert("Please select a Class, Month, and Year.");
    }
    
    outputDiv.classList.remove("hidden");
    tableContainer.innerHTML = `<p>Loading data for ${selectedClass} / ${monthSelect.options[monthSelect.selectedIndex].text} ${selectedYear}...</p>`;

    console.log("--- Report Generation Debug ---");
    console.log(`Requested Class: ${selectedClass}`);
    console.log(`Requested Month: ${selectedMonth.padStart(2, '0')}`);
    console.log(`Requested Year: ${selectedYear}`);
    
    try {
        // 1. Fetch all attendance records
        const qAll = collection(db, "attendance");
        const allRecordsSnapshot = await getDocs(qAll);
        
        let allRecords = [];
        allRecordsSnapshot.forEach(doc => {
            allRecords.push(doc.data());
        });
        
        console.log(`Total attendance records fetched: ${allRecords.length}`);

        // 2. Filter records by Class, Month, and Year
        const filteredRecords = allRecords.filter(record => {
            if (!record.date || !record.class) {
                return false; // Skip records without date or class
            }
            // Date format is YYYY-MM-DD
            const { year, month } = getNumericDateParts(record.date);
            
            // Note: selectedMonth is a string like "1", "2", etc. The parsed month is also a string like "1", "2".
            return record.class === selectedClass && 
                   month === selectedMonth && 
                   year === selectedYear;
        });
        
        console.log(`Records filtered for class/month/year: ${filteredRecords.length}`);

        if (filteredRecords.length === 0) {
            tableContainer.innerHTML = `<h3>No Attendance Data Found</h3><p>No records found for ${selectedClass} in ${monthSelect.options[monthSelect.selectedIndex].text} ${selectedYear}.</p>`;
            monthlyReportData = null; // Clear old data
            return;
        }

        // 3. Structure the data by Student and Date
        const classStudents = students.filter(s => s.class === selectedClass);
        
        // Map to hold student data for the report
        const studentMap = classStudents.reduce((acc, student) => {
            acc[student.id] = { id: student.id, name: student.name, records: {} };
            return acc;
        }, {});

        // Set to collect all unique days attended in the month
        const dates = new Set(); 
        
        filteredRecords.forEach(record => {
            const studentId = record.studentId;
            if (studentMap[studentId]) {
                const dayOfMonth = getNumericDateParts(record.date).day; // e.g., "05"
                // Store status and comment for that day
                studentMap[studentId].records[dayOfMonth] = { status: record.status, comment: record.comment };
                dates.add(parseInt(dayOfMonth, 10)); // Use integer for sorting
            }
        });
        
        // Sort dates numerically
        const sortedDates = Array.from(dates).sort((a, b) => a - b); 

        // 4. Build the HTML Table and CSV Data
        
        let tableHTML = `
            <h3>Attendance Report: ${selectedClass} - ${monthSelect.options[monthSelect.selectedIndex].text} ${selectedYear}</h3>
            <div class="table-scroll">
            <table id="monthlyReportTable">
            <thead><tr><th>ID</th><th>Name</th>
        `;
        
        // Add date headers
        sortedDates.forEach(day => {
            tableHTML += `<th>${day}</th>`;
        });
        
        tableHTML += '<th>Total P</th><th>Total A</th><th>% Att</th></tr></thead><tbody>';

        // Prepare data for CSV export
        const reportDataForExport = [];
        reportDataForExport.push(["ID", "Name", ...sortedDates.map(d => `Day ${d}`), "Total Present", "Total Absent", "Attendance %"]);

        classStudents.forEach(stu => {
            const studentId = stu.id;
            const studentEntry = studentMap[studentId];
            
            let totalPresent = 0;
            let totalAbsent = 0;
            let rowHTML = `<tr><td>${studentId}</td><td>${stu.name}</td>`;
            
            const studentDataForExport = [studentId, stu.name];

            sortedDates.forEach(dayInt => {
                const dayString = String(dayInt).padStart(2, '0'); // Pad back to "05" for lookup
                const record = studentEntry.records[dayString];
                
                let statusChar = '';
                let cellClass = '';
                
                if (record) {
                    if (record.status === 'Present') {
                        statusChar = 'P';
                        cellClass = 'status-present';
                        totalPresent++;
                    } else if (record.status === 'Absent') {
                        statusChar = 'A';
                        cellClass = 'status-absent';
                        totalAbsent++;
                    }
                    studentDataForExport.push(statusChar);
                } else {
                    // Not recorded on this day, treat as N/A for this report
                    statusChar = '-';
                    cellClass = 'status-not-recorded';
                    studentDataForExport.push('N/A'); // Use N/A for CSV if no record exists
                }

                // Add cell with tooltip for comment
                rowHTML += `<td class="${cellClass}" title="${record && record.comment ? record.comment : ''}">${statusChar}</td>`;
            });
            
            const totalDays = totalPresent + totalAbsent;
            const percentage = totalDays > 0 ? ((totalPresent / totalDays) * 100).toFixed(2) : 0;

            rowHTML += `
                <td>${totalPresent}</td>
                <td>${totalAbsent}</td>
                <td>${percentage}%</td>
            </tr>`;
            
            tableHTML += rowHTML;
            
            studentDataForExport.push(totalPresent, totalAbsent, `${percentage}%`);
            reportDataForExport.push(studentDataForExport);
        });

        tableHTML += '</tbody></table></div>';
        tableContainer.innerHTML = tableHTML;
        
        // Store the CSV data structure for export
        monthlyReportData = reportDataForExport;

    } catch (error) {
        console.error("Error generating monthly report:", error);
        tableContainer.innerHTML = `<h3>Error</h3><p>An error occurred while generating the report. Check the console.</p>`;
        monthlyReportData = null;
    }
}

/**
 * Exports the currently generated monthly report to a CSV file.
 */
window.exportMonthlyReportToCSV = function() {
    if (!monthlyReportData) {
        return alert("Please generate a report first.");
    }
    
    // Convert the array of arrays into a CSV string
    const csvContent = monthlyReportData.map(e => e.join(",")).join("\n");
    
    const monthSelect = document.getElementById("reportMonthSelect");
    const yearSelect = document.getElementById("reportYearSelect");
    const selectedMonthName = monthSelect.options[monthSelect.selectedIndex].text;
    const selectedYear = yearSelect.value;
    const selectedClass = currentClass;

    const filename = `${selectedClass}_Attendance_Report_${selectedMonthName}_${selectedYear}.csv`;
    
    // Create a blob and trigger a download
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    
    if (navigator.msSaveBlob) { // IE 10+
        navigator.msSaveBlob(blob, filename);
    } else {
        const link = document.createElement("a");
        if (link.download !== undefined) { 
            const url = URL.createObjectURL(blob);
            link.setAttribute("href", url);
            link.setAttribute("download", filename);
            link.style.visibility = 'hidden';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            alert("Report exported successfully!");
        } else {
            alert("Your browser does not support automatic downloads. Please save the content manually.");
        }
    }
}
