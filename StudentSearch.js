import React from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';

const StudentSearch = ({ theme, searchQuery, onSearchQueryChange }) => {
  return (
    <View style={styles.container}>
      <View style={[styles.searchContainer, { backgroundColor: theme.cardBackground + '90', borderColor: theme.border }]}>
        <Text style={styles.searchIcon}>🔍</Text>
        <TextInput
          style={[styles.searchInput, { color: theme.text }]}
          placeholder="Search student by name or roll number..."
          placeholderTextColor={theme.textSecondary + '80'}
          value={searchQuery}
          onChangeText={onSearchQueryChange}
          selectionColor={theme.primary}
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => onSearchQueryChange('')} style={styles.clearButton}>
            <Text style={{ color: theme.textSecondary, fontSize: 14 }}>✕</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    width: '100%',
    alignSelf: 'center',
    maxWidth: 768,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 16,
    borderWidth: 1.5,
    paddingHorizontal: 16,
    height: 54,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 2,
  },
  searchIcon: {
    fontSize: 18,
    marginRight: 10,
    opacity: 0.7,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    fontWeight: '500',
    paddingVertical: 0,
  },
  clearButton: {
    padding: 4,
    marginLeft: 8,
  },
});

export default StudentSearch;
