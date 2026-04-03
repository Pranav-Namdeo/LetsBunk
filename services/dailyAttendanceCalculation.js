// Daily Attendance Calculation Service (Task 6)
const cron = require('node-cron');

// Helper: Get default attendance threshold
async function getAttendanceThreshold(SystemSettings) {
    try {
        const setting = await SystemSettings.findOne({ settingKey: 'attendance_threshold' });
        return setting ? parseFloat(setting.value) : 75.0;
    } catch (error) {
        console.error('❌ Error fetching threshold:', error);
        return 75.0; // Default fallback
    }
}

// Helper: Calculate daily attendance for all students
async function calculateDailyAttendance(models) {
    const { StudentManagement, Timetable, PeriodAttendance, DailyAttendance, SystemSettings } = models;
    
    const startTime = Date.now();
    console.log('\n' + '='.repeat(60));
    console.log('📊 [DAILY-CALC] Starting daily attendance calculation');
    console.log('⏰ Time:', new Date().toISOString());
    console.log('='.repeat(60));

    try {
        // Get today's date
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        console.log(`📅 [DAILY-CALC] Calculating for date: ${today.toISOString()}`);

        // Get attendance threshold
        const threshold = await getAttendanceThreshold(SystemSettings);
        console.log(`📏 [DAILY-CALC] Using threshold: ${threshold}%`);

        // Get all students
        const students = await StudentManagement.find({});
        console.log(`👥 [DAILY-CALC] Found ${students.length} students`);

        let processedCount = 0;
        let errorCount = 0;
        const results = [];

        for (const student of students) {
            try {
                // Get timetable for student's class
                const timetable = await Timetable.findOne({
                    semester: student.semester,
                    branch: student.branch
                });

                if (!timetable) {
                    console.log(`⚠️ [DAILY-CALC] No timetable for ${student.enrollmentNo} (${student.semester}, ${student.branch})`);
                    continue;
                }

                // Get day of week
                const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
                const dayName = days[today.getDay()];
                const daySchedule = timetable.timetable[dayName];

                if (!daySchedule || daySchedule.length === 0) {
                    console.log(`⚠️ [DAILY-CALC] No classes on ${dayName} for ${student.enrollmentNo}`);
                    continue;
                }

                // Count total periods (excluding breaks)
                const totalPeriods = daySchedule.filter(p => !p.isBreak).length;

                if (totalPeriods === 0) {
                    console.log(`⚠️ [DAILY-CALC] No valid periods for ${student.enrollmentNo}`);
                    continue;
                }

                // Get period attendance records for today
                const periodRecords = await PeriodAttendance.find({
                    enrollmentNo: student.enrollmentNo,
                    date: today
                });

                // Count present and absent periods
                const presentPeriods = periodRecords.filter(r => r.status === 'present').length;
                const absentPeriods = totalPeriods - presentPeriods;

                // Calculate percentage
                const attendancePercentage = (presentPeriods / totalPeriods) * 100;

                // Determine daily status based on threshold
                const dailyStatus = attendancePercentage >= threshold ? 'present' : 'absent';

                // Check if daily record already exists
                const existingDaily = await DailyAttendance.findOne({
                    enrollmentNo: student.enrollmentNo,
                    date: today
                });

                let dailyRecord;
                if (existingDaily) {
                    // Update existing record
                    existingDaily.totalPeriods = totalPeriods;
                    existingDaily.presentPeriods = presentPeriods;
                    existingDaily.absentPeriods = absentPeriods;
                    existingDaily.attendancePercentage = attendancePercentage;
                    existingDaily.dailyStatus = dailyStatus;
                    existingDaily.threshold = threshold;
                    existingDaily.calculatedAt = new Date();
                    
                    dailyRecord = await existingDaily.save();
                    console.log(`🔄 [DAILY-CALC] Updated ${student.enrollmentNo}: ${presentPeriods}/${totalPeriods} = ${attendancePercentage.toFixed(1)}% → ${dailyStatus}`);
                } else {
                    // Create new record
                    dailyRecord = await DailyAttendance.create({
                        enrollmentNo: student.enrollmentNo,
                        studentName: student.name,
                        date: today,
                        totalPeriods,
                        presentPeriods,
                        absentPeriods,
                        attendancePercentage,
                        dailyStatus,
                        threshold,
                        semester: student.semester,
                        branch: student.branch
                    });
                    console.log(`✨ [DAILY-CALC] Created ${student.enrollmentNo}: ${presentPeriods}/${totalPeriods} = ${attendancePercentage.toFixed(1)}% → ${dailyStatus}`);
                }

                results.push({
                    enrollmentNo: student.enrollmentNo,
                    name: student.name,
                    presentPeriods,
                    totalPeriods,
                    percentage: attendancePercentage,
                    status: dailyStatus
                });

                processedCount++;

            } catch (studentError) {
                console.error(`❌ [DAILY-CALC] Error processing ${student.enrollmentNo}:`, studentError.message);
                errorCount++;
            }
        }

        const duration = Date.now() - startTime;
        console.log('\n' + '='.repeat(60));
        console.log('✅ [DAILY-CALC] Daily attendance calculation completed');
        console.log(`📊 Processed: ${processedCount} students`);
        console.log(`❌ Errors: ${errorCount} students`);
        console.log(`⏱️ Duration: ${duration}ms`);
        console.log('='.repeat(60) + '\n');

        return {
            success: true,
            processedCount,
            errorCount,
            duration,
            results
        };

    } catch (error) {
        const duration = Date.now() - startTime;
        console.error('\n' + '='.repeat(60));
        console.error('❌ [DAILY-CALC] Fatal error in daily calculation');
        console.error('Error:', error.message);
        console.error('Stack:', error.stack);
        console.error(`⏱️ Duration: ${duration}ms`);
        console.error('='.repeat(60) + '\n');

        // TODO: Send admin alert email/notification
        
        return {
            success: false,
            error: error.message,
            duration
        };
    }
}

// Initialize daily calculation job
function initializeDailyCalculation(models) {
    console.log('🔧 [DAILY-CALC] Initializing daily attendance calculation service');
    
    // Schedule daily calculation at 23:59 every day
    // Cron format: minute hour day month dayOfWeek
    // 59 23 * * * = At 23:59 every day
    const dailyCalculationJob = cron.schedule('59 23 * * *', async () => {
        console.log('⏰ [CRON] Daily calculation job triggered');
        await calculateDailyAttendance(models);
    }, {
        scheduled: true,
        timezone: "Asia/Kolkata" // Adjust to your timezone
    });

    console.log('✅ Daily attendance calculation job scheduled (23:59 daily, Asia/Kolkata timezone)');
    
    return dailyCalculationJob;
}

module.exports = {
    calculateDailyAttendance,
    initializeDailyCalculation
};
