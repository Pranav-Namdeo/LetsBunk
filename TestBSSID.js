import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert, ScrollView } from 'react-native';
import { NativeModules, PermissionsAndroid, Platform } from 'react-native';
import WiFiManager from './WiFiManager';
import NativeWiFiService from './NativeWiFiService';
import BSSIDStorage from './BSSIDStorage';
import { SERVER_BASE_URL } from './config';

const { WifiModule } = NativeModules;

export default function TestBSSID({ theme }) {
  const [testResults, setTestResults] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [currentBSSID, setCurrentBSSID] = useState(null);
  const [wifiInfo, setWifiInfo] = useState(null);
  const [isMonitoring, setIsMonitoring] = useState(false);

  const addResult = (test, result, success = true) => {
    const timestamp = new Date().toLocaleTimeString();
    setTestResults(prev => [...prev, {
      id: Date.now(),
      test,
      result,
      success,
      timestamp
    }]);
  };

  const clearResults = () => {
    setTestResults([]);
  };

  const runFullTest = async () => {
    setIsLoading(true);
    clearResults();
    
    try {
      addResult('Test Started', 'Running comprehensive BSSID detection test...');

      // Test 1: Check if native module exists
      addResult('Native Module Check', WifiModule ? '✅ WifiModule found' : '❌ WifiModule not found', !!WifiModule);
      
      if (!WifiModule) {
        addResult('Error', 'Native WiFi module not available. Please rebuild the app.', false);
        setIsLoading(false);
        return;
      }

      // Test 2: Test connection
      try {
        const connectionTest = await WifiModule.testConnection();
        addResult('Connection Test', `✅ ${connectionTest.message}`, true);
      } catch (error) {
        addResult('Connection Test', `❌ ${error.message}`, false);
      }

      // Test 3: Check permissions
      try {
        const permissions = await WifiModule.checkPermissions();
        addResult('Permission Check', `Fine Location: ${permissions.ACCESS_FINE_LOCATION ? '✅' : '❌'}, Coarse Location: ${permissions.ACCESS_COARSE_LOCATION ? '✅' : '❌'}`, permissions.ACCESS_FINE_LOCATION || permissions.ACCESS_COARSE_LOCATION);
        
        // Request permissions if not granted
        if (!permissions.ACCESS_FINE_LOCATION && !permissions.ACCESS_COARSE_LOCATION) {
          addResult('Requesting Permissions', 'Location permission required for BSSID detection...');
          
          const granted = await PermissionsAndroid.requestMultiple([
            PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
            PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION,
          ]);
          
          const fineGranted = granted[PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION] === PermissionsAndroid.RESULTS.GRANTED;
          const coarseGranted = granted[PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION] === PermissionsAndroid.RESULTS.GRANTED;
          
          addResult('Permission Request', `Fine: ${fineGranted ? '✅' : '❌'}, Coarse: ${coarseGranted ? '✅' : '❌'}`, fineGranted || coarseGranted);
        }
      } catch (error) {
        addResult('Permission Check', `❌ ${error.message}`, false);
      }

      // Test 4: Check WiFi state
      try {
        const wifiState = await WifiModule.getWifiState();
        addResult('WiFi State', `WiFi Enabled: ${wifiState.isWifiEnabled ? '✅' : '❌'}, Connected: ${wifiState.isConnectedToWifi ? '✅' : '❌'}`, wifiState.isWifiEnabled);
        
        if (!wifiState.isWifiEnabled) {
          addResult('WiFi Disabled', 'Please enable WiFi and try again', false);
          setIsLoading(false);
          return;
        }
      } catch (error) {
        addResult('WiFi State', `❌ ${error.message}`, false);
      }

      // Test 5: Get BSSID
      try {
        const bssidResult = await WifiModule.getBSSID();
        if (bssidResult.success) {
          addResult('BSSID Detection', `✅ ${bssidResult.bssid}`, true);
          addResult('WiFi Details', `SSID: ${bssidResult.ssid}, Signal: ${bssidResult.rssi} dBm, Speed: ${bssidResult.linkSpeed} Mbps`);
        } else {
          addResult('BSSID Detection', `❌ Failed to get BSSID`, false);
        }
      } catch (error) {
        addResult('BSSID Detection', `❌ ${error.code}: ${error.message}`, false);
        
        // Provide specific guidance
        if (error.code === 'PERMISSION_DENIED') {
          addResult('Solution', '💡 Grant location permission in Android settings');
        } else if (error.code === 'WIFI_DISABLED') {
          addResult('Solution', '💡 Enable WiFi on your device');
        } else if (error.code === 'NO_BSSID') {
          addResult('Solution', '💡 Connect to a WiFi network');
        }
      }

      // Test 6: Test WiFiManager integration
      try {
        addResult('WiFiManager Test', 'Testing WiFiManager integration...');
        await WiFiManager.initialize();
        const managerBSSID = await WiFiManager.getCurrentBSSID();
        addResult('WiFiManager BSSID', managerBSSID ? `✅ ${managerBSSID}` : '❌ No BSSID from WiFiManager', !!managerBSSID);
      } catch (error) {
        addResult('WiFiManager Test', `❌ ${error.message}`, false);
      }

      addResult('Test Complete', '🎉 All tests completed!');

    } catch (error) {
      addResult('Test Error', `❌ ${error.message}`, false);
    }
    
    setIsLoading(false);
  };

  const testDirectBSSID = async () => {
    setIsLoading(true);
    
    try {
      if (!WifiModule) {
        Alert.alert('Error', 'Native WiFi module not available');
        return;
      }

      const result = await WifiModule.getBSSID();
      
      Alert.alert(
        'BSSID Test Result',
        `BSSID: ${result.bssid || 'Not detected'}\nSSID: ${result.ssid || 'Unknown'}\nSignal: ${result.rssi || 0} dBm`,
        [{ text: 'OK' }]
      );
      
    } catch (error) {
      Alert.alert('BSSID Test Failed', `${error.code}: ${error.message}`);
    }
    
    setIsLoading(false);
  };

  const checkOfflineSchedule = async () => {
    setIsLoading(true);
    clearResults();
    
    try {
      addResult('Offline Schedule Check', 'Checking cached BSSID schedule...');

      // Get schedule info
      const info = await BSSIDStorage.getScheduleInfo();
      
      addResult('Cache Status', `Has Schedule: ${info.hasSchedule ? '✅' : '❌'}`, info.hasSchedule);
      addResult('Schedule Date', `Saved: ${info.savedDate}, Is Today: ${info.isToday ? '✅' : '❌'}`, info.isToday);
      addResult('Period Count', `${info.periodCount} periods cached`);
      addResult('Cached At', info.cachedAt);
      addResult('Needs Refresh', info.needsRefresh ? '⚠️ Yes' : '✅ No', !info.needsRefresh);

      if (info.hasSchedule) {
        // Get full schedule
        const schedule = await BSSIDStorage.getFullSchedule();
        
        addResult('Full Schedule', `Found ${schedule.length} periods:`);
        
        schedule.forEach((period, index) => {
          // Handle both single BSSID and multiple BSSIDs
          let bssidDisplay = 'Not configured';
          if (period.bssids && Array.isArray(period.bssids) && period.bssids.length > 0) {
            bssidDisplay = period.bssids.join(', ');
          } else if (Array.isArray(period.bssid) && period.bssid.length > 0) {
            bssidDisplay = period.bssid.join(', ');
          } else if (period.bssid && typeof period.bssid === 'string') {
            bssidDisplay = period.bssid;
          }
          
          addResult(
            `Period ${period.period || index + 1}`,
            `${period.subject || 'No subject'}\n` +
            `Time: ${period.startTime} - ${period.endTime}\n` +
            `Room: ${period.room || 'No room'}\n` +
            `BSSID: ${bssidDisplay}\n` +
            `Teacher: ${period.teacher || 'N/A'}`
          );
        });

        // Get current period
        const currentPeriod = await BSSIDStorage.getCurrentPeriodBSSID();
        
        if (currentPeriod) {
          addResult('Current Period', `✅ Active class found!`, true);
          
          // Handle both single BSSID and multiple BSSIDs
          let bssidDisplay = 'Not configured';
          if (currentPeriod.bssids && Array.isArray(currentPeriod.bssids) && currentPeriod.bssids.length > 0) {
            bssidDisplay = currentPeriod.bssids.join(', ');
          } else if (Array.isArray(currentPeriod.bssid) && currentPeriod.bssid.length > 0) {
            bssidDisplay = currentPeriod.bssid.join(', ');
          } else if (currentPeriod.bssid && typeof currentPeriod.bssid === 'string') {
            bssidDisplay = currentPeriod.bssid;
          }
          
          addResult(
            'Current Class Details',
            `Subject: ${currentPeriod.subject}\n` +
            `Room: ${currentPeriod.room}\n` +
            `Time: ${currentPeriod.startTime} - ${currentPeriod.endTime}\n` +
            `BSSID: ${bssidDisplay}`
          );

          // Test validation with current BSSID
          try {
            const deviceBSSID = await WiFiManager.getCurrentBSSID();
            if (deviceBSSID) {
              const validation = await BSSIDStorage.validateCurrentBSSID(deviceBSSID);
              
              // Format expected BSSIDs for display
              let expectedDisplay = 'N/A';
              if (Array.isArray(validation.expected)) {
                expectedDisplay = validation.expected.join(', ');
              } else if (validation.expected) {
                expectedDisplay = validation.expected;
              }
              
              addResult(
                'BSSID Validation',
                `Status: ${validation.valid ? '✅ AUTHORIZED' : '❌ NOT AUTHORIZED'}\n` +
                `Reason: ${validation.reason}\n` +
                `Message: ${validation.message}\n` +
                `Expected: ${expectedDisplay}\n` +
                `Current: ${validation.current || 'N/A'}`,
                validation.valid
              );
            } else {
              addResult('BSSID Validation', '⚠️ No WiFi BSSID detected on device', false);
            }
          } catch (error) {
            addResult('BSSID Validation', `❌ Error: ${error.message}`, false);
          }
        } else {
          addResult('Current Period', '⚠️ No active class at this time', false);
          addResult('Info', 'Check-in is only allowed during scheduled class periods');
        }
      } else {
        addResult('No Schedule', '❌ No offline schedule cached', false);
        addResult('Solution', '💡 Login to fetch and cache your schedule');
      }

      addResult('Check Complete', '🎉 Offline schedule check completed!');

    } catch (error) {
      addResult('Check Error', `❌ ${error.message}`, false);
    }
    
    setIsLoading(false);
  };

  const refreshScheduleFromServer = async () => {
    setIsLoading(true);
    clearResults();
    
    try {
      addResult('Manual Refresh', 'Fetching fresh schedule from server...');

      // Get enrollment number from AsyncStorage
      const AsyncStorage = require('@react-native-async-storage/async-storage').default;
      const userData = await AsyncStorage.getItem('@user_data');
      
      if (!userData) {
        addResult('Error', '❌ No user data found. Please login first.', false);
        setIsLoading(false);
        return;
      }

      const user = JSON.parse(userData);
      const enrollmentNo = user.enrollmentNo;

      if (!enrollmentNo) {
        addResult('Error', '❌ No enrollment number found', false);
        setIsLoading(false);
        return;
      }

      addResult('User Info', `Enrollment: ${enrollmentNo}`);

      // Fetch from server using configured URL
      const response = await fetch(
        `${SERVER_BASE_URL}/api/daily-bssid-schedule?enrollmentNo=${enrollmentNo}`
      );

      const data = await response.json();

      if (data.success && data.schedule) {
        addResult('Server Response', `✅ Received ${data.schedule.length} periods for ${data.dayName}`, true);

        // Save to cache
        const saved = await BSSIDStorage.saveDailySchedule(data.schedule);

        if (saved) {
          addResult('Cache Updated', `✅ Successfully cached ${data.schedule.length} periods`, true);
          
          // Show schedule details
          data.schedule.forEach((period, index) => {
            // Handle both single BSSID and multiple BSSIDs
            let bssidDisplay = 'Not configured';
            if (period.bssids && Array.isArray(period.bssids) && period.bssids.length > 0) {
              bssidDisplay = period.bssids.join(', ');
            } else if (Array.isArray(period.bssid) && period.bssid.length > 0) {
              bssidDisplay = period.bssid.join(', ');
            } else if (period.bssid && typeof period.bssid === 'string') {
              bssidDisplay = period.bssid;
            }
            
            addResult(
              `Period ${period.period || index + 1}`,
              `${period.subject || 'No subject'}\n` +
              `Time: ${period.startTime} - ${period.endTime}\n` +
              `Room: ${period.room || 'No room'}\n` +
              `BSSID: ${bssidDisplay}`
            );
          });

          addResult('Success', '🎉 Schedule refreshed! Go back to Home to check in.', true);
        } else {
          addResult('Cache Error', '❌ Failed to save schedule to cache', false);
        }
      } else {
        addResult('Server Error', `❌ ${data.message || 'Failed to fetch schedule'}`, false);
      }

    } catch (error) {
      addResult('Refresh Error', `❌ ${error.message}`, false);
      addResult('Solution', '💡 Check if server is running and device is connected to network');
    }
    
    setIsLoading(false);
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <Text style={[styles.title, { color: theme.text }]}>BSSID Detection Test</Text>
      
      <View style={styles.buttonContainer}>
        <TouchableOpacity 
          style={[styles.button, { backgroundColor: theme.primary }]}
          onPress={runFullTest}
          disabled={isLoading}
        >
          <Text style={styles.buttonText}>
            {isLoading ? '🔄 Testing...' : '🧪 Run Full Test'}
          </Text>
        </TouchableOpacity>
        
        <TouchableOpacity 
          style={[styles.button, { backgroundColor: '#6b7280' }]}
          onPress={testDirectBSSID}
          disabled={isLoading}
        >
          <Text style={styles.buttonText}>📶 Quick BSSID Test</Text>
        </TouchableOpacity>
        
        <TouchableOpacity 
          style={[styles.button, { backgroundColor: '#8b5cf6' }]}
          onPress={checkOfflineSchedule}
          disabled={isLoading}
        >
          <Text style={styles.buttonText}>📅 Check Offline Schedule</Text>
        </TouchableOpacity>
        
        <TouchableOpacity 
          style={[styles.button, { backgroundColor: '#10b981' }]}
          onPress={refreshScheduleFromServer}
          disabled={isLoading}
        >
          <Text style={styles.buttonText}>🔄 Refresh from Server</Text>
        </TouchableOpacity>
        
        <TouchableOpacity 
          style={[styles.button, { backgroundColor: '#ef4444' }]}
          onPress={clearResults}
        >
          <Text style={styles.buttonText}>🗑️ Clear Results</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.resultsContainer}>
        {testResults.map((result) => (
          <View key={result.id} style={[styles.resultItem, { backgroundColor: theme.cardBackground }]}>
            <View style={styles.resultHeader}>
              <Text style={[styles.resultTest, { color: theme.text }]}>{result.test}</Text>
              <Text style={[styles.resultTime, { color: theme.textSecondary }]}>{result.timestamp}</Text>
            </View>
            <Text style={[styles.resultText, { color: result.success ? '#10b981' : '#ef4444' }]}>
              {result.result}
            </Text>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 20,
  },
  buttonContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 20,
  },
  button: {
    flex: 1,
    minWidth: 100,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  buttonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  resultsContainer: {
    flex: 1,
  },
  resultItem: {
    padding: 12,
    marginBottom: 8,
    borderRadius: 8,
    elevation: 1,
  },
  resultHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  resultTest: {
    fontSize: 14,
    fontWeight: '600',
  },
  resultTime: {
    fontSize: 12,
  },
  resultText: {
    fontSize: 13,
    fontFamily: 'monospace',
  },
});