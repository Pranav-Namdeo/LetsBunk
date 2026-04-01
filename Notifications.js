import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { Picker } from '@react-native-picker/picker';

const Notifications = ({ onBack, theme, teacherId }) => {
  const [selectedFilter, setSelectedFilter] = useState('all');
  const [selectedSemester, setSelectedSemester] = useState('');
  const [selectedBranch, setSelectedBranch] = useState('');
  const [notificationTitle, setNotificationTitle] = useState('');
  const [notificationMessage, setNotificationMessage] = useState('');
  const [sending, setSending] = useState(false);

  const semesters = ['1', '2', '3', '4', '5', '6', '7', '8'];
  const branches = [
    { id: 'cse', name: 'Computer Science Engineering' },
    { id: 'ece', name: 'Electronics & Communication' },
    { id: 'me', name: 'Mechanical Engineering' },
    { id: 'ce', name: 'Civil Engineering' },
    { id: 'ee', name: 'Electrical Engineering' },
    { id: 'it', name: 'Information Technology' },
  ];

  const handleFilterChange = (filter) => {
    setSelectedFilter(filter);
    if (filter === 'all') {
      setSelectedSemester('');
      setSelectedBranch('');
    } else if (filter === 'semester') {
      setSelectedBranch('');
    } else if (filter === 'branch') {
      setSelectedSemester('');
    }
  };

  const getRecipientCount = () => {
    if (selectedFilter === 'all') return 'All Students';
    if (selectedFilter === 'semester' && selectedSemester) {
      return `Semester ${selectedSemester} Students`;
    }
    if (selectedFilter === 'branch' && selectedBranch) {
      const branch = branches.find(b => b.id === selectedBranch);
      return `${branch?.name} Students`;
    }
    if (selectedFilter === 'both' && selectedSemester && selectedBranch) {
      const branch = branches.find(b => b.id === selectedBranch);
      return `${branch?.name} - Semester ${selectedSemester}`;
    }
    return 'Select recipients';
  };

  const handleSendNotification = async () => {
    if (!notificationTitle.trim() || !notificationMessage.trim()) {
      alert('Please enter both title and message');
      return;
    }

    if (selectedFilter === 'semester' && !selectedSemester) {
      alert('Please select a semester');
      return;
    }

    if (selectedFilter === 'branch' && !selectedBranch) {
      alert('Please select a branch');
      return;
    }

    if (selectedFilter === 'both' && (!selectedSemester || !selectedBranch)) {
      alert('Please select both semester and branch');
      return;
    }

    setSending(true);

    try {
      // TODO: Replace with actual API call
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      alert(`Notification sent to ${getRecipientCount()}!`);
      
      // Reset form
      setNotificationTitle('');
      setNotificationMessage('');
    } catch (error) {
      alert('Failed to send notification');
    } finally {
      setSending(false);
    }
  };

  const FilterOption = ({ id, label, icon, description }) => (
    <TouchableOpacity
      onPress={() => handleFilterChange(id)}
      style={[
        styles.filterOption,
        {
          borderColor: selectedFilter === id ? theme.primary : theme.border,
          backgroundColor: selectedFilter === id ? theme.primary + '10' : 'transparent',
        }
      ]}
    >
      <View style={styles.radioContainer}>
        <View style={[
          styles.radioOuter,
          { borderColor: selectedFilter === id ? theme.primary : theme.border }
        ]}>
          {selectedFilter === id && (
            <View style={[styles.radioInner, { backgroundColor: theme.primary }]} />
          )}
        </View>
        <View style={styles.filterTextContainer}>
          <View style={styles.filterLabelRow}>
            <Text style={styles.filterIcon}>{icon}</Text>
            <Text style={[styles.filterLabel, { color: theme.text }]}>{label}</Text>
          </View>
          <Text style={[styles.filterDescription, { color: theme.textSecondary }]}>
            {description}
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: theme.cardBackground, borderBottomColor: theme.border }]}>
        <TouchableOpacity onPress={onBack} style={styles.backButton}>
          <Text style={[styles.backIcon, { color: theme.text }]}>←</Text>
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: theme.text }]}>Send Notification</Text>
      </View>

      {/* Content */}
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        {/* Recipients Section */}
        <View style={[styles.card, { backgroundColor: theme.cardBackground, borderColor: theme.border }]}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardIcon}>👥</Text>
            <Text style={[styles.cardTitle, { color: theme.text }]}>Select Recipients</Text>
          </View>

          <View style={styles.filterOptions}>
            <FilterOption
              id="all"
              label="All Students"
              icon="👥"
              description="Send notification to everyone"
            />

            <FilterOption
              id="semester"
              label="Semester"
              icon="🎓"
              description="Send to specific semester"
            />

            {selectedFilter === 'semester' && (
              <View style={[styles.pickerContainer, { backgroundColor: theme.background, borderColor: theme.border }]}>
                <Picker
                  selectedValue={selectedSemester}
                  onValueChange={setSelectedSemester}
                  style={[styles.picker, { color: theme.text }]}
                >
                  <Picker.Item label="Select Semester" value="" />
                  {semesters.map(sem => (
                    <Picker.Item key={sem} label={`Semester ${sem}`} value={sem} />
                  ))}
                </Picker>
              </View>
            )}

            <FilterOption
              id="branch"
              label="Branch"
              icon="🏢"
              description="Send to specific branch"
            />

            {selectedFilter === 'branch' && (
              <View style={[styles.pickerContainer, { backgroundColor: theme.background, borderColor: theme.border }]}>
                <Picker
                  selectedValue={selectedBranch}
                  onValueChange={setSelectedBranch}
                  style={[styles.picker, { color: theme.text }]}
                >
                  <Picker.Item label="Select Branch" value="" />
                  {branches.map(branch => (
                    <Picker.Item key={branch.id} label={branch.name} value={branch.id} />
                  ))}
                </Picker>
              </View>
            )}

            <FilterOption
              id="both"
              label="Semester + Branch"
              icon="🎓🏢"
              description="Send to specific semester and branch"
            />

            {selectedFilter === 'both' && (
              <View style={styles.bothPickersContainer}>
                <Text style={[styles.pickerLabel, { color: theme.textSecondary }]}>Select Semester</Text>
                <View style={[styles.pickerContainer, { backgroundColor: theme.background, borderColor: theme.border }]}>
                  <Picker
                    selectedValue={selectedSemester}
                    onValueChange={setSelectedSemester}
                    style={[styles.picker, { color: theme.text }]}
                  >
                    <Picker.Item label="Select Semester" value="" />
                    {semesters.map(sem => (
                      <Picker.Item key={sem} label={`Semester ${sem}`} value={sem} />
                    ))}
                  </Picker>
                </View>

                <Text style={[styles.pickerLabel, { color: theme.textSecondary, marginTop: 12 }]}>Select Branch</Text>
                <View style={[styles.pickerContainer, { backgroundColor: theme.background, borderColor: theme.border }]}>
                  <Picker
                    selectedValue={selectedBranch}
                    onValueChange={setSelectedBranch}
                    style={[styles.picker, { color: theme.text }]}
                  >
                    <Picker.Item label="Select Branch" value="" />
                    {branches.map(branch => (
                      <Picker.Item key={branch.id} label={branch.name} value={branch.id} />
                    ))}
                  </Picker>
                </View>
              </View>
            )}
          </View>

          {/* Recipients Display */}
          <View style={[styles.recipientsDisplay, { backgroundColor: theme.primary + '20', borderColor: theme.primary + '40' }]}>
            <Text style={[styles.recipientsText, { color: theme.primary }]}>
              <Text style={styles.recipientsLabel}>Recipients: </Text>
              {getRecipientCount()}
            </Text>
          </View>
        </View>

        {/* Notification Form */}
        <View style={[styles.card, { backgroundColor: theme.cardBackground, borderColor: theme.border }]}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardIcon}>📨</Text>
            <Text style={[styles.cardTitle, { color: theme.text }]}>Notification Details</Text>
          </View>

          <View style={styles.formContainer}>
            <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>Title</Text>
            <TextInput
              style={[styles.input, { backgroundColor: theme.background, borderColor: theme.border, color: theme.text }]}
              placeholder="Enter notification title"
              placeholderTextColor={theme.textSecondary + '80'}
              value={notificationTitle}
              onChangeText={setNotificationTitle}
            />

            <Text style={[styles.inputLabel, { color: theme.textSecondary, marginTop: 16 }]}>Message</Text>
            <TextInput
              style={[styles.textArea, { backgroundColor: theme.background, borderColor: theme.border, color: theme.text }]}
              placeholder="Enter notification message"
              placeholderTextColor={theme.textSecondary + '80'}
              value={notificationMessage}
              onChangeText={setNotificationMessage}
              multiline
              numberOfLines={6}
              textAlignVertical="top"
            />

            <View style={styles.characterCount}>
              <Text style={[styles.characterCountText, { color: theme.textSecondary }]}>
                {notificationMessage.length} characters
              </Text>
              <Text style={[styles.characterCountText, { color: theme.textSecondary }]}>
                {notificationTitle.length > 0 && notificationMessage.length > 0 ? 'Ready to send' : 'Fill in all fields'}
              </Text>
            </View>
          </View>
        </View>

        {/* Send Button */}
        <TouchableOpacity
          onPress={handleSendNotification}
          disabled={sending}
          style={[
            styles.sendButton,
            {
              backgroundColor: sending ? theme.border : theme.primary,
              opacity: sending ? 0.6 : 1,
            }
          ]}
        >
          {sending ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Text style={styles.sendIcon}>📨</Text>
              <Text style={styles.sendButtonText}>Send Notification</Text>
            </>
          )}
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 16,
    paddingTop: 48,
    borderBottomWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  backButton: {
    padding: 8,
    marginRight: 16,
  },
  backIcon: {
    fontSize: 24,
    fontWeight: 'bold',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 24,
    paddingBottom: 40,
  },
  card: {
    borderRadius: 12,
    padding: 24,
    marginBottom: 24,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    gap: 8,
  },
  cardIcon: {
    fontSize: 20,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  filterOptions: {
    gap: 12,
  },
  filterOption: {
    borderRadius: 12,
    borderWidth: 2,
    padding: 16,
  },
  radioContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  radioOuter: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 2,
  },
  radioInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  filterTextContainer: {
    flex: 1,
  },
  filterLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  filterIcon: {
    fontSize: 16,
  },
  filterLabel: {
    fontSize: 16,
    fontWeight: '600',
  },
  filterDescription: {
    fontSize: 13,
  },
  pickerContainer: {
    borderRadius: 8,
    borderWidth: 1,
    marginLeft: 32,
    marginTop: 12,
    overflow: 'hidden',
  },
  picker: {
    height: 50,
  },
  bothPickersContainer: {
    marginLeft: 32,
    marginTop: 12,
  },
  pickerLabel: {
    fontSize: 14,
    fontWeight: '500',
    marginBottom: 8,
  },
  recipientsDisplay: {
    marginTop: 16,
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
  },
  recipientsText: {
    fontSize: 14,
  },
  recipientsLabel: {
    fontWeight: '600',
  },
  formContainer: {
    gap: 8,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '500',
    marginBottom: 8,
  },
  input: {
    borderRadius: 8,
    borderWidth: 1,
    padding: 12,
    fontSize: 16,
  },
  textArea: {
    borderRadius: 8,
    borderWidth: 1,
    padding: 12,
    fontSize: 16,
    minHeight: 150,
  },
  characterCount: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  characterCountText: {
    fontSize: 13,
  },
  sendButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    borderRadius: 12,
    gap: 8,
  },
  sendIcon: {
    fontSize: 20,
  },
  sendButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});

export default Notifications;
