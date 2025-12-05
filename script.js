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
 * Manages which main view is visible: Login, Attendance, History, or Report.
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
          })
          .catch(err => console.error("Error loading student data:", err));
    } else {
        // User is logged out
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
        // Sign-out successful.
        currentUserRole = null;
        updateUI(null);
        alert("Logged out successfully!");
    }).catch((error) => {
        console.error("Logout Error:", error);
        alert("Logout failed. Please try again.");
    });
};

/**
 * Listener for authentication state changes (handles automatic login/logout UI).
 */
onAuthStateChanged(auth, async (user) => {
    if (user) {
        // User is signed in. Fetch role.
        try {
            const userRef = doc(db, "users", user.uid);
            const userSnap = await getDoc(userRef);
            if (userSnap.exists()) {
                currentUserRole = userSnap.data().role;
            } else {
                currentUserRole = 'basic'; // Default role if not set
            }
        } catch (error) {
            console.error("Error fetching user role:", error);
            currentUserRole = 'basic';
        }
        updateUI(currentUserRole);
    } else {
        // User is signed out.
        currentUserRole = null;
        updateUI(null);
    }
});

// --- CLASS AND STUDENT LOGIC ---

/**
 * Populates the class dropdown based on the unique classes found in the student data.
 * The class order is fixed for logical presentation.
 */
function populateClassDropdown() {
  const select = document.getElementById("classSelect");
  if (!select) return;

  // Define the fixed order of classes based on your student data
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

// --- Load Class Students ---
window.loadClassStudents = function () {
    if (!currentUserRole) return alert("Please log in first.");
    const classSelect = document.getElementById("classSelect");
    const selectedClass = classSelect.value;
    if (!selectedClass) return alert("Please select a class");
    
    currentClass = selectedClass;
    const classStudents = students.filter(s => s.class === currentClass);
    if (classStudents.length === 0) return alert(`No students found for class: ${currentClass}`);
    
    manageViews('attendance');
    
    const tbody = document.getElementById("studentBody");
    tbody.innerHTML = "";
    attendanceData = {};
    
    classStudents.forEach(stu => {
        attendanceData[stu.id] = {
            studentId: stu.id,
            name: stu.name, // Store name in attendance data for history
            status: "Present",
            comment: "",
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
                <input type="text" id="comment-${stu.id}" class="comment-box" oninput="updateComment(${stu.id})" placeholder="Optional comment..." disabled>
            </td>
        `;
        tbody.appendChild(row);
    });
    
    document.getElementById("studentTable").classList.remove("hidden");
    document.getElementById("saveBtn").classList.remove("hidden");
};


// --- ATTENDANCE INPUT HANDLERS ---
window.updateStatus = function (id, status) {
    attendanceData[id].status = status;
    const commentInput = document.getElementById(`comment-${id}`);
    
    if (status === "Absent") {
        commentInput.disabled = false;
    } else {
        commentInput.disabled = true;
        attendanceData[id].comment = "";
        commentInput.value = ""; // Clear comment when switching back to Present
    }
};

window.updateComment = function (id) {
    // Only update comment if status is Absent, though it should only be enabled then.
    if (attendanceData[id].status === "Absent") {
        attendanceData[id].comment = document.getElementById(`comment-${id}`).value;
    }
};


// --- SAVE TO FIRESTORE ---
window.saveAttendance = async function () {
    if (!currentClass) return alert("Please load a class first.");
    const today = getStandardDate(); // Use standard YYYY-MM-DD format for key
    const recordsToSave = Object.values(attendanceData);
    
    if (recordsToSave.length === 0) return alert("No student data to save.");

    try {
        for (const record of recordsToSave) {
            // Document ID structure: [studentId]_[YYYY-MM-DD]
            const docId = `${record.studentId}_${today}`; 
            
            // Add or overwrite the date field with the standard date format
            record.date = today;

            // Use setDoc to overwrite or create the document
            await setDoc(doc(db, "attendance", docId), record);
        }

        alert("Attendance Saved Online Successfully!");
    } catch (error) {
        console.error("Error saving attendance:", error);
        alert("Failed to save attendance. Check console for details.");
    }
};


// --- STUDENT HISTORY LOGIC ---

/**
 * Helper function to find student object by ID from the local students array.
 */
function getStudentInfo(id) {
    const studentId = parseInt(id);
    // Find the student in the locally loaded array
    return students.find(s => s.id === studentId);
}

/**
 * Prompts user for Student ID and validates it before loading history.
 */
window.showStudentHistoryPrompt = function() {
    if (!currentUserRole) return alert("Please log in to view student history.");
    const id = prompt("Enter Student ID:");
    if (!id) return;
    
    const student = getStudentInfo(id);

    if (!student) {
        return alert(`Student with ID ${id} not found in local records. Please check the ID.`);
    }

    manageViews('history');
    // Call the dedicated function to fetch and display the history
    loadStudentHistory(id, student.name); 
};


/**
 * Fetches and displays the attendance history for a specific student.
 */
async function loadStudentHistory(id, name) {
    const historyDiv = document.getElementById("studentHistoryView");
    if (!historyDiv) return;

    // Display student name in the initial loading message and the final heading
    historyDiv.innerHTML = `<p>Loading history for ${name} (ID: ${id})...</p>`;

    try {
        // FIX: The where clause operator was incorrectly set to "==...". Corrected to "==".
        const q = query(collection(db, "attendance"), where("studentId", "==", parseInt(id))); 
        const results = await getDocs(q);

        // UPDATE: Use the student name in the main heading
        historyDiv.innerHTML = `<h2>Attendance History for ${name} (ID: ${id})</h2>`;

        if (results.empty) {
          historyDiv.innerHTML += `<p>No attendance records found.</p>`;
          return;
        }

        results.forEach(docSnap => {
          const rec = docSnap.data();
          
          // Use rec.date if available, otherwise show N/A
          const displayDate = rec.date || 'N/A (Old Format)';

          const block = document.createElement('div');
          block.innerHTML = `
            <p><strong>Date:</strong> ${displayDate}</p>
            <p><strong>Class:</strong> ${rec.class || 'N/A'}</p>
            <p><strong>Status:</strong> <span style="font-weight: bold; color: ${rec.status === 'Present' ? '#2ecc71' : '#e74c3c'};">${rec.status}</span></p>
            ${rec.comment ? `<p><strong>Comment:</strong> ${rec.comment}</p>` : ''}
            <hr>
          `;
          historyDiv.appendChild(block);
        });
    } catch (error) {
        console.error("Error loading student history:", error);
        // The error message for the user should now display the student name as well
        historyDiv.innerHTML = `<h2>Error Loading History</h2><p>Failed to load attendance records for ${name} (ID: ${id}). Please check your connection and console.</p>`;
    }
}


// --- REPORT GENERATION LOGIC ---

/**
 * Populates month and year dropdowns for the report view.
 */
window.showReportView = function() {
    if (!currentUserRole) return alert("Please log in first.");
    manageViews('report');
    
    // Check if dropdowns are already populated to prevent duplicates
    const monthSelect = document.getElementById("reportMonthSelect");
    if (monthSelect.options.length > 1) return; 

    const yearSelect = document.getElementById("reportYearSelect");
    
    // Clear previous options
    monthSelect.innerHTML = '<option value="" selected disabled>-- Select Month --</option>';
    yearSelect.innerHTML = '<option value="" selected disabled>-- Select Year --</option>';

    const months = [ 
        { name: "January", val: "1" }, { name: "February", val: "2" }, { name: "March", val: "3" }, 
        { name: "April", val: "4" }, { name: "May", val: "5" }, { name: "June", val: "6" }, 
        { name: "July", val: "7" }, { name: "August", val: "8" }, { name: "September", val: "9" }, 
        { name: "October", val: "10" }, { name: "November", val: "11" }, { name: "December", val: "12" } 
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


/**
 * Generates and displays the monthly attendance report.
 */
window.generateMonthlyReport = async function() {
    if (!currentUserRole) return alert("Please log in first.");
    const monthSelect = document.getElementById("reportMonthSelect");
    const yearSelect = document.getElementById("reportYearSelect");
    const outputDiv = document.getElementById("reportOutput");

    const selectedMonth = monthSelect.value;
    const selectedYear = yearSelect.value;
    
    if (!selectedMonth || !selectedYear) {
        outputDiv.innerHTML = `<p style="color: #e74c3c;">Please select both a month and a year.</p>`;
        outputDiv.classList.remove("hidden");
        return;
    }

    outputDiv.innerHTML = `<p>Generating report for ${monthSelect.options[monthSelect.selectedIndex].text}, ${selectedYear}...</p>`;
    outputDiv.classList.remove("hidden");

    try {
        // Construct the month prefix for filtering (e.g., "2025-07")
        const monthPrefix = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}`;

        // Fetch all attendance records
        const attendanceRef = collection(db, "attendance");
        const snapshot = await getDocs(attendanceRef);
        
        let allRecords = [];
        snapshot.forEach(docSnap => {
            allRecords.push(docSnap.data());
        });
        
        // 1. Filter records by month/year
        const filteredRecords = allRecords.filter(record => 
            record.date && record.date.startsWith(monthPrefix)
        );

        if (filteredRecords.length === 0) {
            outputDiv.innerHTML = `<p style="color: #e74c3c;">No attendance records found for ${monthSelect.options[monthSelect.selectedIndex].text}, ${selectedYear}.</p>`;
            return;
        }

        // 2. Group records by class
        const classRecords = filteredRecords.reduce((acc, record) => {
            if (!acc[record.class]) {
                acc[record.class] = [];
            }
            acc[record.class].push(record);
            return acc;
        }, {});
        
        // Clear previous report
        const monthlyReportTableContainer = document.getElementById("monthlyReportTableContainer");
        monthlyReportTableContainer.innerHTML = '';
        
        let allClassData = [];
        
        // 3. Process each class
        for (const [className, records] of Object.entries(classRecords)) {
            // Get all students for this class from the local students list
            const classStudents = students.filter(s => s.class === className);

            // Structure data for reporting
            const studentMap = classStudents.reduce((acc, student) => {
                acc[student.id] = { 
                    id: student.id, 
                    name: student.name, 
                    records: {}, 
                    totalP: 0, 
                    totalA: 0 
                };
                return acc;
            }, {});

            const dates = new Set();
            records.forEach(record => {
                const studentId = record.studentId;
                if (studentMap[studentId]) {
                    const dayOfMonth = getNumericDateParts(record.date).day;
                    studentMap[studentId].records[dayOfMonth] = { 
                        status: record.status, 
                        comment: record.comment 
                    };
                    dates.add(parseInt(dayOfMonth, 10));
                    
                    if (record.status === 'Present') {
                        studentMap[studentId].totalP++;
                    } else if (record.status === 'Absent') {
                        studentMap[studentId].totalA++;
                    }
                }
            });

            const sortedDates = Array.from(dates).sort((a, b) => a - b);
            
            // If no dates were recorded for this class, skip it (shouldn't happen if filteredRecords isn't empty, but good defensive programming)
            if (sortedDates.length === 0) continue; 
            
            // 4. Build the HTML Table and CSV Data
            let tableHTML = `
                <h3 style="color: #1a4a75; margin-top: 30px;">Class: ${className}</h3>
                <table id="monthlyReportTable">
                    <thead>
                        <tr>
                            <th>ID</th>
                            <th>Name</th>
            `;
            
            // Add Date Headers
            sortedDates.forEach(day => { 
                tableHTML += `<th>${day}</th>`; 
            });
            
            tableHTML += '<th>Total P</th><th>Total A</th><th>% Att</th></tr></thead><tbody>';

            // Calculate total days recorded in the month for this class
            const totalDaysRecorded = sortedDates.length; 
            
            let csvData = [];
            
            // Process Students
            Object.values(studentMap).sort((a, b) => a.id - b.id).forEach(student => {
                let rowHTML = `<tr><td>${student.id}</td><td>${student.name}</td>`;
                let csvRow = [student.id, student.name];
                
                // Add Status per Day
                sortedDates.forEach(day => {
                    const record = student.records[String(day).padStart(2, '0')];
                    let status = record ? (record.status === 'Present' ? 'P' : 'A') : '-';
                    rowHTML += `<td>${status}</td>`;
                    csvRow.push(status);
                });
                
                // Calculate Attendance Percentage
                const totalAttendance = student.totalP + student.totalA; 
                const percentage = totalAttendance > 0 
                    ? ((student.totalP / totalAttendance) * 100).toFixed(1) 
                    : "0.0";
                
                rowHTML += `<td>${student.totalP}</td><td>${student.totalA}</td><td>${percentage}%</td></tr>`;
                csvRow.push(student.totalP, student.totalA, `${percentage}%`);
                
                tableHTML += rowHTML;
                csvData.push(csvRow);
            });

            tableHTML += '</tbody></table>';

            // Append HTML table to the container
            const classDiv = document.createElement('div');
            classDiv.innerHTML = tableHTML;
            monthlyReportTableContainer.appendChild(classDiv);
            
            // Store data for export
            allClassData.push({ 
                className: className, 
                dates: sortedDates, 
                data: csvData 
            });
        }
        
        monthlyReportData = allClassData;
        outputDiv.innerHTML = ''; // Clear loading message
        outputDiv.classList.remove("hidden");

    } catch (error) {
        console.error("Error generating report:", error);
        outputDiv.innerHTML = `<p style="color: #e74c3c;">Failed to generate report. An error occurred.</p>`;
    }
};


/**
 * Exports the generated monthly report to a CSV file.
 */
window.exportMonthlyReportToCSV = function() {
    if (!monthlyReportData || monthlyReportData.length === 0) {
        return alert("Please generate a monthly report first.");
    }
    
    const monthSelect = document.getElementById("reportMonthSelect");
    const yearSelect = document.getElementById("reportYearSelect");
    const monthName = monthSelect.options[monthSelect.selectedIndex].text;
    const year = yearSelect.value;

    let csvContent = "";
    
    monthlyReportData.forEach(classData => {
        // Add Class Name Header
        csvContent += `\n\nClass: ${classData.className} Attendance Report for ${monthName}, ${year}\n`;
        
        // Create CSV Headers
        let headers = ["ID", "Name"];
        classData.dates.forEach(day => headers.push(day));
        headers.push("Total P", "Total A", "% Att");
        csvContent += headers.join(',') + "\n";
        
        // Add Data Rows
        classData.data.forEach(row => {
            // Join array elements to form the CSV row
            csvContent += row.join(',') + "\n"; 
        });
    });

    const filename = `Attendance_Report_${monthName}_${year}.csv`;
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    
    // Download the file
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
            alert("Report downloaded successfully!");
        } else {
            alert("Your browser does not support automatic downloads. Please save the content manually.");
        }
    }
}
