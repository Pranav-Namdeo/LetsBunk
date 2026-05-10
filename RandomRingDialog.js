import React, { useState } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  TextInput,
  StyleSheet,
} from 'react-native';

const RandomRingDialog = ({ visible, onClose, onConfirm, theme }) => {
  const [selectedOption, setSelectedOption] = useState(null); // 'all' or 'select'
  const [numberOfStudents, setNumberOfStudents] = useState('');

  const handleConfirm = () => {
    if (selectedOption === 'all') {
      onConfirm({ type: 'all' });
    } else if (selectedOption === 'select' && numberOfStudents) {
      onConfirm({ type: 'select', count: parseInt(numberOfStudents) });
    }
    
    // Reset and close
    setSelectedOption(null);
    setNumberOfStudents('');
    onClose();
  };

  const handleCancel = () => {
    setSelectedOption(null);
    setNumberOfStudents('');
    onClose();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={handleCancel}
    >
      <View style={styles.overlay}>
        <View style={[styles.container, { backgroundColor: theme.cardBackground }]}>
          {/* Header */}
          <View style={[styles.header, { borderBottomColor: theme.border }]}>
            <Text style={[styles.title, { color: theme.text }]}>
              🔔 Random Ring
            </Text>
            <TouchableOpacity onPress={handleCancel}>
              <Text style={[styles.closeButton, { color: theme.text }]}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* Description */}
          <Text style={[styles.description, { color: theme.textSecondary }]}>
            Choose how many students to randomly select for attendance check.
          </Text>

          {/* Options */}
          <View style={styles.optionsContainer}>
            {/* All Students Option */}
            <TouchableOpacity
              onPress={() => setSelectedOption('all')}
              style={[
                styles.optionButton,
                {
                  borderColor: selectedOption === 'all' ? theme.primary : theme.border,
                  backgroundColor: selectedOption === 'all' ? theme.primary + '10' : 'transparent',
                }
              ]}
            >
              <View style={[
                styles.iconCircle,
                { backgroundColor: selectedOption === 'all' ? theme.primary : theme.border }
              ]}>
                <Text style={styles.iconText}>👥</Text>
              </View>
              <View style={styles.optionTextContainer}>
                <Text style={[styles.optionTitle, { color: theme.text }]}>
                  All Students
                </Text>
                <Text style={[styles.optionSubtitle, { color: theme.textSecondary }]}>
                  Ring all students in the class
                </Text>
              </View>
            </TouchableOpacity>

            {/* Select Number Option */}
            <TouchableOpacity
              onPress={() => setSelectedOption('select')}
              style={[
                styles.optionButton,
                {
                  borderColor: selectedOption === 'select' ? theme.primary : theme.border,
                  backgroundColor: selectedOption === 'select' ? theme.primary + '10' : 'transparent',
                }
              ]}
            >
              <View style={[
                styles.iconCircle,
                { backgroundColor: selectedOption === 'select' ? theme.primary : theme.border }
              ]}>
                <Text style={styles.iconText}>#️⃣</Text>
              </View>
              <View style={styles.optionTextContainer}>
                <Text style={[styles.optionTitle, { color: theme.text }]}>
                  Select Number
                </Text>
                <Text style={[styles.optionSubtitle, { color: theme.textSecondary }]}>
                  Choose specific number of students
                </Text>
              </View>
            </TouchableOpacity>

            {/* Number Input */}
            {selectedOption === 'select' && (
              <View style={styles.inputContainer}>
                <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>
                  Number of students
                </Text>
                <TextInput
                  style={[
                    styles.input,
                    {
                      backgroundColor: theme.background,
                      borderColor: theme.border,
                      color: theme.text,
                    }
                  ]}
                  placeholder="Enter number (e.g., 5)"
                  placeholderTextColor={theme.textSecondary}
                  keyboardType="number-pad"
                  value={numberOfStudents}
                  onChangeText={setNumberOfStudents}
                  maxLength={2}
                />
              </View>
            )}
          </View>

          {/* Footer Buttons */}
          <View style={styles.footer}>
            <TouchableOpacity
              onPress={handleCancel}
              style={[styles.button, styles.cancelButton, { borderColor: theme.border }]}
            >
              <Text style={[styles.buttonText, { color: theme.text }]}>Cancel</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={handleConfirm}
              disabled={
                !selectedOption ||
                (selectedOption === 'select' && (!numberOfStudents || parseInt(numberOfStudents) <= 0))
              }
              style={[
                styles.button,
                styles.confirmButton,
                {
                  backgroundColor: theme.primary,
                  opacity: (!selectedOption || (selectedOption === 'select' && !numberOfStudents)) ? 0.5 : 1,
                }
              ]}
            >
              <Text style={styles.confirmButtonText}>Start Random Ring</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  container: {
    width: '100%',
    maxWidth: 448, // sm:max-w-md
    borderRadius: 12,
    padding: 24,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    paddingBottom: 12,
    borderBottomWidth: 1,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  closeButton: {
    fontSize: 24,
    fontWeight: 'bold',
  },
  description: {
    fontSize: 14,
    marginBottom: 20,
  },
  optionsContainer: {
    marginBottom: 20,
  },
  optionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 8, // rounded-lg
    borderWidth: 2,
    marginBottom: 12,
  },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  iconText: {
    fontSize: 20,
  },
  optionTextContainer: {
    flex: 1,
  },
  optionTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  optionSubtitle: {
    fontSize: 13,
  },
  inputContainer: {
    marginTop: 8,
    paddingLeft: 16,
  },
  inputLabel: {
    fontSize: 13,
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
  },
  footer: {
    flexDirection: 'row',
    gap: 12,
  },
  button: {
    flex: 1,
    padding: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  cancelButton: {
    borderWidth: 1,
  },
  confirmButton: {
    // backgroundColor set dynamically
  },
  buttonText: {
    fontSize: 15,
    fontWeight: '600',
  },
  confirmButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
});

export default RandomRingDialog;
