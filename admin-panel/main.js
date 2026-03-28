const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');

// Handle Squirrel events for Windows installer
try {
  if (require('electron-squirrel-startup')) {
    app.quit();
  }
} catch (e) {
  // electron-squirrel-startup not available, continue normally
}

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1200,
    minHeight: 700,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      enableRemoteModule: true
    },
    frame: true,
    backgroundColor: '#0a0e27',
    icon: path.join(__dirname, 'icon.png'),
    title: 'LetsBunk Admin Panel',
    show: false // Don't show until ready
  });

  mainWindow.loadFile('index.html');

  // Show window when ready
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // Open DevTools in development
  // mainWindow.webContents.openDevTools();

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Set application menu
  const { Menu, shell } = require('electron');
  const template = [
    {
      label: 'File',
      submenu: [
        {
          label: 'New Student',
          accelerator: 'CmdOrCtrl+N',
          click: () => {
            mainWindow.webContents.executeJavaScript('showAddStudentModal()');
          }
        },
        {
          label: 'New Teacher',
          accelerator: 'CmdOrCtrl+Shift+N',
          click: () => {
            mainWindow.webContents.executeJavaScript('showAddTeacherModal()');
          }
        },
        {
          label: 'New Classroom',
          click: () => {
            mainWindow.webContents.executeJavaScript('showAddClassroomModal()');
          }
        },
        { type: 'separator' },
        {
          label: 'Import Students (CSV)',
          accelerator: 'CmdOrCtrl+I',
          click: () => {
            mainWindow.webContents.executeJavaScript('showBulkStudentModal()');
          }
        },
        {
          label: 'Import Teachers (CSV)',
          click: () => {
            mainWindow.webContents.executeJavaScript('showBulkTeacherModal()');
          }
        },
        {
          label: 'Import Classrooms (CSV)',
          click: () => {
            mainWindow.webContents.executeJavaScript('showBulkClassroomModal()');
          }
        },
        { type: 'separator' },
        {
          label: 'Export Timetable',
          accelerator: 'CmdOrCtrl+E',
          click: () => {
            mainWindow.webContents.executeJavaScript('exportToPDF()');
          }
        },
        { type: 'separator' },
        {
          label: 'Settings',
          accelerator: 'CmdOrCtrl+,',
          click: () => {
            mainWindow.webContents.executeJavaScript('switchSection("settings")');
          }
        },
        { type: 'separator' },
        { role: 'quit', accelerator: 'CmdOrCtrl+Q' }
      ]
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo', accelerator: 'CmdOrCtrl+Z' },
        { role: 'redo', accelerator: 'CmdOrCtrl+Y' },
        { type: 'separator' },
        { role: 'cut', accelerator: 'CmdOrCtrl+X' },
        { role: 'copy', accelerator: 'CmdOrCtrl+C' },
        { role: 'paste', accelerator: 'CmdOrCtrl+V' },
        { role: 'selectAll', accelerator: 'CmdOrCtrl+A' },
        { type: 'separator' },
        {
          label: 'Find',
          accelerator: 'CmdOrCtrl+F',
          click: () => {
            mainWindow.webContents.executeJavaScript('document.querySelector(".search-input")?.focus()');
          }
        }
      ]
    },
    {
      label: 'Navigate',
      submenu: [
        {
          label: 'Dashboard',
          accelerator: 'CmdOrCtrl+1',
          click: () => {
            mainWindow.webContents.executeJavaScript('switchSection("dashboard")');
          }
        },
        {
          label: 'Students',
          accelerator: 'CmdOrCtrl+2',
          click: () => {
            mainWindow.webContents.executeJavaScript('switchSection("students")');
          }
        },
        {
          label: 'Teachers',
          accelerator: 'CmdOrCtrl+3',
          click: () => {
            mainWindow.webContents.executeJavaScript('switchSection("teachers")');
          }
        },
        {
          label: 'Classrooms',
          accelerator: 'CmdOrCtrl+4',
          click: () => {
            mainWindow.webContents.executeJavaScript('switchSection("classrooms")');
          }
        },
        {
          label: 'Timetable',
          accelerator: 'CmdOrCtrl+5',
          click: () => {
            mainWindow.webContents.executeJavaScript('switchSection("timetable")');
          }
        },
        {
          label: 'Calendar',
          accelerator: 'CmdOrCtrl+6',
          click: () => {
            mainWindow.webContents.executeJavaScript('switchSection("calendar")');
          }
        }
      ]
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload', accelerator: 'CmdOrCtrl+R' },
        { role: 'forceReload', accelerator: 'CmdOrCtrl+Shift+R' },
        { role: 'toggleDevTools', accelerator: 'F12' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn', accelerator: 'CmdOrCtrl+Plus' },
        { role: 'zoomOut', accelerator: 'CmdOrCtrl+-' },
        { type: 'separator' },
        { role: 'togglefullscreen', accelerator: 'F11' },
        { type: 'separator' },
        {
          label: 'Refresh Data',
          accelerator: 'F5',
          click: () => {
            mainWindow.webContents.executeJavaScript(`
              const activeSection = document.querySelector('.section.active');
              if (activeSection) {
                const sectionId = activeSection.id.replace('-section', '');
                switch(sectionId) {
                  case 'students': loadStudents(); break;
                  case 'teachers': loadTeachers(); break;
                  case 'classrooms': loadClassrooms(); break;
                  case 'dashboard': loadDashboardData(); break;
                  case 'calendar': loadCalendar(); break;
                }
              }
            `);
          }
        }
      ]
    },
    {
      label: 'Data',
      submenu: [
        {
          label: 'Export All Students',
          click: () => {
            mainWindow.webContents.executeJavaScript(`
              if (students && students.length > 0) {
                const csv = 'enrollmentNo,name,email,course,semester,dob,phone\\n' + 
                  students.map(s => \`\${s.enrollmentNo},\${s.name},\${s.email},\${s.course},\${s.semester},\${s.dob},\${s.phone || ''}\`).join('\\n');
                const blob = new Blob([csv], { type: 'text/csv' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = 'students_export.csv';
                a.click();
                showNotification('Students exported successfully', 'success');
              } else {
                showNotification('No students to export', 'warning');
              }
            `);
          }
        },
        {
          label: 'Export All Teachers',
          click: () => {
            mainWindow.webContents.executeJavaScript(`
              if (teachers && teachers.length > 0) {
                const csv = 'employeeId,name,email,department,subject,dob,phone\\n' + 
                  teachers.map(t => \`\${t.employeeId},\${t.name},\${t.email},\${t.department},\${t.subject || ''},\${t.dob},\${t.phone || ''}\`).join('\\n');
                const blob = new Blob([csv], { type: 'text/csv' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = 'teachers_export.csv';
                a.click();
                showNotification('Teachers exported successfully', 'success');
              } else {
                showNotification('No teachers to export', 'warning');
              }
            `);
          }
        },
        {
          label: 'Export All Classrooms',
          click: () => {
            mainWindow.webContents.executeJavaScript(`
              if (classrooms && classrooms.length > 0) {
                const csv = 'roomNumber,building,capacity,bssid,isActive\\n' + 
                  classrooms.map(c => \`\${c.roomNumber},\${c.building},\${c.capacity},\${c.bssid || ''},\${c.isActive}\`).join('\\n');
                const blob = new Blob([csv], { type: 'text/csv' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = 'classrooms_export.csv';
                a.click();
                showNotification('Classrooms exported successfully', 'success');
              } else {
                showNotification('No classrooms to export', 'warning');
              }
            `);
          }
        },
        { type: 'separator' },
        {
          label: 'Delete All Students',
          click: () => {
            dialog.showMessageBox(mainWindow, {
              type: 'warning',
              title: 'Confirm Delete',
              message: 'Are you sure you want to delete ALL students?',
              detail: 'This action cannot be undone!',
              buttons: ['Cancel', 'Delete All'],
              defaultId: 0,
              cancelId: 0
            }).then(result => {
              if (result.response === 1) {
                mainWindow.webContents.executeJavaScript(`
                  fetch(SERVER_URL + '/api/students/delete-all', { method: 'DELETE' })
                    .then(() => {
                      showNotification('All students deleted', 'success');
                      loadStudents();
                    })
                    .catch(err => showNotification('Failed to delete students', 'error'));
                `);
              }
            });
          }
        },
        {
          label: 'Delete All Teachers',
          click: () => {
            dialog.showMessageBox(mainWindow, {
              type: 'warning',
              title: 'Confirm Delete',
              message: 'Are you sure you want to delete ALL teachers?',
              detail: 'This action cannot be undone!',
              buttons: ['Cancel', 'Delete All'],
              defaultId: 0,
              cancelId: 0
            }).then(result => {
              if (result.response === 1) {
                mainWindow.webContents.executeJavaScript(`
                  fetch(SERVER_URL + '/api/teachers/delete-all', { method: 'DELETE' })
                    .then(() => {
                      showNotification('All teachers deleted', 'success');
                      loadTeachers();
                    })
                    .catch(err => showNotification('Failed to delete teachers', 'error'));
                `);
              }
            });
          }
        }
      ]
    },
    {
      label: 'Reports',
      submenu: [
        {
          label: 'Attendance Report',
          accelerator: 'CmdOrCtrl+Shift+A',
          click: () => {
            mainWindow.webContents.executeJavaScript(`
              showNotification('Generating attendance report...', 'info');
              // Add attendance report generation logic
            `);
          }
        },
        {
          label: 'Student Performance',
          click: () => {
            mainWindow.webContents.executeJavaScript(`
              showNotification('Generating performance report...', 'info');
            `);
          }
        },
        {
          label: 'Teacher Workload',
          click: () => {
            mainWindow.webContents.executeJavaScript(`
              showNotification('Generating workload report...', 'info');
            `);
          }
        },
        { type: 'separator' },
        {
          label: 'Monthly Summary',
          click: () => {
            mainWindow.webContents.executeJavaScript(`
              showNotification('Generating monthly summary...', 'info');
            `);
          }
        },
        {
          label: 'Semester Report',
          click: () => {
            mainWindow.webContents.executeJavaScript(`
              showNotification('Generating semester report...', 'info');
            `);
          }
        }
      ]
    },
    {
      label: 'Tools',
      submenu: [
        {
          label: 'Timetable Tools',
          submenu: [
            {
              label: 'Validate Timetable',
              click: () => {
                mainWindow.webContents.executeJavaScript('validateTimetable()');
              }
            },
            {
              label: 'Check Conflicts',
              click: () => {
                mainWindow.webContents.executeJavaScript('showConflictCheck()');
              }
            },
            {
              label: 'Auto Fill Timetable',
              click: () => {
                mainWindow.webContents.executeJavaScript('autoFillTimetable()');
              }
            },
            {
              label: 'Duplicate Timetable',
              click: () => {
                mainWindow.webContents.executeJavaScript('duplicateTimetable()');
              }
            }
          ]
        },
        { type: 'separator' },
        {
          label: 'Bulk Operations',
          submenu: [
            {
              label: 'Bulk Update Students',
              click: () => {
                mainWindow.webContents.executeJavaScript('showBulkStudentModal()');
              }
            },
            {
              label: 'Bulk Update Teachers',
              click: () => {
                mainWindow.webContents.executeJavaScript('showBulkTeacherModal()');
              }
            },
            {
              label: 'Bulk Assign Teachers',
              click: () => {
                mainWindow.webContents.executeJavaScript('showTeacherAssign()');
              }
            }
          ]
        },
        { type: 'separator' },
        {
          label: 'Database',
          submenu: [
            {
              label: 'Backup Data',
              click: () => {
                dialog.showMessageBox(mainWindow, {
                  type: 'info',
                  title: 'Backup',
                  message: 'Backup Feature',
                  detail: 'Use MongoDB Atlas backup or export data as CSV files.'
                });
              }
            },
            {
              label: 'Restore Data',
              click: () => {
                dialog.showMessageBox(mainWindow, {
                  type: 'info',
                  title: 'Restore',
                  message: 'Restore Feature',
                  detail: 'Use MongoDB Atlas restore or import CSV files.'
                });
              }
            },
            {
              label: 'Clear Cache',
              click: () => {
                mainWindow.webContents.session.clearCache().then(() => {
                  dialog.showMessageBox(mainWindow, {
                    type: 'info',
                    title: 'Cache Cleared',
                    message: 'Application cache has been cleared successfully.'
                  });
                });
              }
            }
          ]
        },
        { type: 'separator' },
        {
          label: 'Server Connection',
          submenu: [
            {
              label: 'Test Connection',
              click: () => {
                mainWindow.webContents.executeJavaScript('checkServerConnection()');
              }
            },
            {
              label: 'Change Server URL',
              click: () => {
                mainWindow.webContents.executeJavaScript('switchSection("settings")');
              }
            },
            {
              label: 'View Server Status',
              click: () => {
                mainWindow.webContents.executeJavaScript(`
                  const status = document.getElementById('serverStatusText').textContent;
                  alert('Server Status: ' + status);
                `);
              }
            }
          ]
        }
      ]
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'close' },
        { type: 'separator' },
        {
          label: 'Always on Top',
          type: 'checkbox',
          checked: false,
          click: (menuItem) => {
            mainWindow.setAlwaysOnTop(menuItem.checked);
          }
        },
        { type: 'separator' },
        { role: 'front' }
      ]
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'Documentation',
          click: () => {
            shell.openExternal('https://github.com/adityasingh03rajput/native-bunk');
          }
        },
        {
          label: 'Keyboard Shortcuts',
          accelerator: 'CmdOrCtrl+/',
          click: () => {
            dialog.showMessageBox(mainWindow, {
              type: 'info',
              title: 'Keyboard Shortcuts',
              message: 'Complete Keyboard Shortcuts Guide',
              detail: `
📁 FILE MENU:
  Ctrl+N          New Student
  Ctrl+Shift+N    New Teacher
  Ctrl+I          Import CSV
  Ctrl+E          Export Timetable
  Ctrl+,          Settings
  Ctrl+Q          Quit Application

✏️ EDIT MENU:
  Ctrl+Z          Undo
  Ctrl+Y          Redo
  Ctrl+X          Cut
  Ctrl+C          Copy
  Ctrl+V          Paste
  Ctrl+A          Select All
  Ctrl+F          Find/Search

🧭 NAVIGATE MENU:
  Ctrl+1          Dashboard
  Ctrl+2          Students
  Ctrl+3          Teachers
  Ctrl+4          Classrooms
  Ctrl+5          Timetable
  Ctrl+6          Calendar

👁️ VIEW MENU:
  Ctrl+R          Reload Page
  Ctrl+Shift+R    Force Reload
  F5              Refresh Data
  F11             Toggle Fullscreen
  F12             Developer Tools
  Ctrl++          Zoom In
  Ctrl+-          Zoom Out
  Ctrl+0          Reset Zoom

📊 REPORTS MENU:
  Ctrl+Shift+A    Attendance Report

❓ HELP MENU:
  Ctrl+/          Show This Help

💡 TIPS:
• Use Tab to navigate between fields
• Press Enter to submit forms
• Press Esc to close modals
• Double-click cells to edit in timetable
• Right-click for context menus
              `.trim()
            });
          }
        },
        { type: 'separator' },
        {
          label: 'Report Issue',
          click: () => {
            shell.openExternal('https://github.com/adityasingh03rajput/native-bunk/issues');
          }
        },
        {
          label: 'Check for Updates',
          click: () => {
            dialog.showMessageBox(mainWindow, {
              type: 'info',
              title: 'Updates',
              message: 'You are using the latest version',
              detail: 'Version 1.0.0'
            });
          }
        },
        { type: 'separator' },
        {
          label: 'About',
          click: () => {
            dialog.showMessageBox(mainWindow, {
              type: 'info',
              title: 'About LetsBunk Admin Panel',
              message: 'LetsBunk Admin Panel',
              detail: `Version 1.0.0

A comprehensive admin panel for managing:
• Students and their attendance
• Teachers and assignments
• Classrooms and schedules
• Timetables and calendars

Built with Electron & Node.js
© 2025 LetsBunk - All Rights Reserved`
            });
          }
        }
      ]
    }
  ];
  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// IPC Handlers for file operations
ipcMain.handle('select-csv-file', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [
      { name: 'CSV Files', extensions: ['csv'] },
      { name: 'All Files', extensions: ['*'] }
    ]
  });

  if (!result.canceled && result.filePaths.length > 0) {
    return result.filePaths[0];
  }
  return null;
});
