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
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js"; // IMPORTING AUTH MODULES

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

  select.innerHTML = '<option value="" selected disabled>-- 𝑠𝑒𝑙𝑒𝑐𝑡 𝑐𝑙𝑎𝑠𝑠 --</option>';

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
      name: stu.name,
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

// --- SAVE TO FIRESTORE ---
window.saveAttendance = async function () {
  if (!currentUserRole) return alert("Please log in to save attendance.");

  const standardDate = getStandardDate(); 
  console.log(`Saving attendance for date: ${standardDate}`);

  for (let id of Object.keys(attendanceData)) {
    const record = {
        ...attendanceData[id],
        date: standardDate, // YYYY-MM-DD
    };
    
    await setDoc(doc(db, "attendance", `${id}_${standardDate}`), record);
  }

  alert("Attendance Saved Online Successfully!");
};

// --- SHOW REPORT VIEW ---
window.showReportView = function() {
    if (!currentUserRole) return alert("Please log in first.");
    
    const classSelect = document.getElementById("classSelect");
    currentClass = classSelect.value;
    if (!currentClass) {
        return alert("Please select a class first.");
    }

    manageViews('report');
    
    document.getElementById("reportHeader").textContent = `📊 Monthly Attendance Report for ${currentClass}`;
    populateMonthYearDropdowns();
}

// --- Helper to populate month/year dropdowns ---
function populateMonthYearDropdowns() {
    const monthSelect = document.getElementById("reportMonthSelect");
    const yearSelect = document.getElementById("reportYearSelect");
    
    if (!monthSelect || !yearSelect) return;

    monthSelect.innerHTML = '<option value="" selected disabled>-- 𝑠𝑒𝑙𝑒𝑐𝑡 𝑚𝑜𝑛𝑡ℎ --</option>';
    yearSelect.innerHTML = '<option value="" selected disabled>-- 𝑠𝑒𝑙𝑒𝑐𝑡 𝑦𝑒𝑎𝑟 --</option>';

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


// --- GENERATE MONTHLY REPORT (with Debugging) ---
window.generateMonthlyReport = async function() {
    if (!currentUserRole) return alert("Please log in first.");

    const monthSelect = document.getElementById("reportMonthSelect");
    const yearSelect = document.getElementById("reportYearSelect");
    const outputDiv = document.getElementById("reportOutput");
    const tableContainer = document.getElementById("monthlyReportTableContainer");

    const selectedMonth = monthSelect.value;
    const selectedYear = yearSelect.value;
    const selectedClass = currentClass;

    if (!selectedClass || !selectedMonth || !selectedYear) {
        return alert("Please select a Class, Month, and Year.");
    }
    
    outputDiv.classList.remove("hidden");
    tableContainer.innerHTML = `<p>Loading data for ${selectedClass} / ${monthSelect.options[monthSelect.selectedIndex].text} ${selectedYear}...</p>`;

    console.log("--- Report Generation Debug ---");
    console.log(`Requested Class: ${selectedClass}`);
    console.log(`Requested Month (Filter Value): ${selectedMonth}`);
    console.log(`Requested Year (Filter Value): ${selectedYear}`);

    try {
        const q = query(collection(db, "attendance"), where("class", "==", selectedClass));
        const results = await getDocs(q);
        
        if (results.empty) {
            tableContainer.innerHTML = `<p>No attendance records found for ${selectedClass} in Firestore (empty query result).</p>`;
            monthlyReportData = null;
            return;
        }

        let totalRecordsPulled = 0;
        let totalRecordsFilteredOut = 0;
        
        const filteredRecords = results.docs
            .map(doc => doc.data())
            .filter(record => {
                totalRecordsPulled++;
                const dateParts = getNumericDateParts(record.date);
                
                console.log(`[Record Date]: ${record.date || 'N/A'}`);
                
                if (dateParts) {
                    const isMatch = dateParts.month === selectedMonth && dateParts.year === selectedYear;
                    if (!isMatch) {
                        totalRecordsFilteredOut++;
                        console.log(`   --> FAILED filter. Found M: ${dateParts.month}, Y: ${dateParts.year}`);
                    }
                    return isMatch;
                } else {
                    totalRecordsFilteredOut++;
                    console.log(`   --> FAILED filter. Date format is not YYYY-MM-DD.`);
                    return false;
                }
            });
            
        console.log(`Total Records Retrieved: ${totalRecordsPulled}`);
        console.log(`Total Records Filtered Out: ${totalRecordsFilteredOut}`);
        
        if (filteredRecords.length === 0) {
            tableContainer.innerHTML = `<p>No attendance records found for ${selectedClass} in ${monthSelect.options[monthSelect.selectedIndex].text} ${selectedYear}.</p>`;
            monthlyReportData = null; 
            return;
        }
        
        console.log(`SUCCESS! Found ${filteredRecords.length} records matching the criteria.`);

        // 3. Organize data for the monthly table
        const classStudents = students.filter(s => s.class === selectedClass);
        const studentMap = classStudents.reduce((acc, student) => {
            acc[student.id] = { id: student.id, name: student.name, records: {} };
            return acc;
        }, {});
        
        const dates = new Set();
        
        filteredRecords.forEach(record => {
            const studentId = record.studentId; 
            if (studentMap[studentId]) {
                const dayOfMonth = getNumericDateParts(record.date).day; 
                studentMap[studentId].records[dayOfMonth] = { status: record.status, comment: record.comment };
                dates.add(parseInt(dayOfMonth, 10)); 
            }
        });

        const sortedDates = Array.from(dates).sort((a, b) => a - b);
        
        // 4. Build the HTML Table and CSV Data
        let tableHTML = '<thead><tr><th>ID</th><th>Name</th>';
        sortedDates.forEach(day => {
            tableHTML += `<th>${day}</th>`;
        });
        tableHTML += '<th>Total P</th><th>Total A</th><th>% Att</th></tr></thead><tbody>';

        const reportDataForExport = [];
        reportDataForExport.push(["ID", "Name", ...sortedDates.map(d => `Day ${d}`), "Total Present", "Total Absent", "Attendance %"]);

        classStudents.forEach(stu => {
            const studentId = stu.id;
            const studentEntry = studentMap[studentId];
            
            let totalPresent = 0;
            let totalAbsent = 0;
            let rowHTML = `<tr><td>${studentId}</td><td>${studentEntry.name}</td>`;
            
            const exportRow = [studentId, studentEntry.name];

            sortedDates.forEach(day => {
                const paddedDay = String(day).padStart(2, '0');
                const record = studentEntry.records[paddedDay] || {};
                const status = record.status || 'N/A';
                
                if (status === 'Present') totalPresent++;
                if (status === 'Absent') totalAbsent++;
                
                const displayStatus = status === 'Present' ? 'P' : (status === 'Absent' ? 'A' : '-');
                const titleComment = record.comment ? `title="${record.comment}"` : '';
                
                rowHTML += `<td ${titleComment}>${displayStatus}</td>`;
                exportRow.push(displayStatus);
            });
            
            const totalDays = sortedDates.length;
            const percentage = totalDays > 0 ? ((totalPresent / totalDays) * 100).toFixed(1) : '0.0';

            rowHTML += `<td>${totalPresent}</td><td>${totalAbsent}</td><td>${percentage}%</td></tr>`;
            tableHTML += rowHTML;
            
            exportRow.push(totalPresent, totalAbsent, `${percentage}%`);
            reportDataForExport.push(exportRow);
        });

        tableHTML += '</tbody>';
        
        document.getElementById("monthlyReportTableContainer").innerHTML = `<table id="monthlyReportTable">${tableHTML}</table>`;
        monthlyReportData = reportDataForExport;

    } catch(error) {
        console.error("Error generating monthly report:", error);
        tableContainer.innerHTML = `<p style="color: red;">Error loading report data: ${error.message}</p>`;
        monthlyReportData = null;
    }
}


// --- EXPORT TO CSV FUNCTION ---
window.exportMonthlyReportToCSV = function() {
    if (!monthlyReportData) {
        return alert("Please generate the report first.");
    }

    const selectedMonthName = document.getElementById("reportMonthSelect").options[document.getElementById("reportMonthSelect").selectedIndex].text;
    const selectedYear = document.getElementById("reportYearSelect").value;
    const selectedClass = currentClass;

    const filename = `Attendance_Report_${selectedClass}_${selectedMonthName}_${selectedYear}.csv`;

    function convertToCSV(data) {
        return data.map(row => {
            return row.map(cell => {
                let processedCell = String(cell).replace(/"/g, '""');
                if (processedCell.includes(',') || processedCell.includes('"')) {
                    processedCell = `"${processedCell}"`;
                }
                return processedCell;
            }).join(',');
        }).join('\n');
    }

    const csvContent = convertToCSV(monthlyReportData);
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
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

// --- LOAD STUDENT HISTORY (must be window-attached) ---
window.showStudentHistoryPrompt = function() {
    if (!currentUserRole) return alert("Please log in to view student history.");
    
    const id = prompt("Enter Student ID:");
    if (!id) return;
    
    loadStudentData(id);
}

async function loadStudentData(id) {
  manageViews('history');
  
  const historyDiv = document.getElementById("studentHistoryView");
  if (!historyDiv) return;
  historyDiv.innerHTML = `<p>Loading history for ID: ${id}...</p>`;

  try {
      // Note: Firebase `where` clause comparison should match the data type in Firestore (string vs number)
      // Since student IDs are used as keys in JavaScript objects, converting to integer is safer if the IDs in Firestore are stored as numbers.
      const q = query(collection(db, "attendance"), where("studentId", "==", parseInt(id))); 
      const results = await getDocs(q);

      historyDiv.innerHTML = `<h2>Attendance History for ID: ${id}</h2>`;

      if (results.empty) {
        historyDiv.innerHTML += `<p>No attendance records found.</p>`;
        return;
      }

      results.forEach(docSnap => {
        const rec = docSnap.data();
        
        const displayDate = rec.date || 'N/A (Old Format)';

        const block = document.createElement('div');
        block.innerHTML = `
          <p><strong>Date:</strong> ${displayDate}</p>
          <p><strong>Class:</strong> ${rec.class || 'N/A'}</p>
          <p><strong>Status:</strong> ${rec.status}</p>
          ${rec.comment ? `<p><strong>Comment:</strong> ${rec.comment}</p>` : ''}
          <hr>
        `;
        historyDiv.appendChild(block);
      });
  } catch (error) {
      historyDiv.innerHTML = `<p style="color: red;">Error loading student history: ${error.message}</p>`;
      console.error("Error loading student history:", error);
  }
}
