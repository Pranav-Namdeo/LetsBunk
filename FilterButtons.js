import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';

const FilterButtons = ({ selectedFilter, onFilterChange, counts, theme }) => {
  const filters = [
    { id: 'all', label: 'All', icon: '📋', count: counts.all },
    { id: 'active', label: 'Active', icon: '🟢', count: counts.active },
    { id: 'present', label: 'Present', icon: '✅', count: counts.present },
    { id: 'absent', label: 'Absent', icon: '❌', count: counts.absent },
  ];

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.container}
    >
      {filters.map((filter) => {
        const isSelected = selectedFilter === filter.id;
        
        return (
          <TouchableOpacity
            key={filter.id}
            onPress={() => onFilterChange(filter.id)}
            style={[
              styles.filterButton,
              {
                backgroundColor: isSelected ? theme.primary : theme.cardBackground,
                borderColor: isSelected ? theme.primary : theme.border,
              }
            ]}
          >
            <Text style={styles.icon}>{filter.icon}</Text>
            <Text style={[
              styles.label,
              { color: isSelected ? '#fff' : theme.text }
            ]}>
              {filter.label}
            </Text>
            <View style={[
              styles.badge,
              {
                backgroundColor: isSelected ? 'rgba(255,255,255,0.3)' : theme.primary + '20',
              }
            ]}>
              <Text style={[
                styles.badgeText,
                { color: isSelected ? '#fff' : theme.primary }
              ]}>
                {filter.count}
              </Text>
            </View>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 8,
  },
  filterButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 2,
    marginRight: 8,
  },
  icon: {
    fontSize: 16,
    marginRight: 6,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    marginRight: 8,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    minWidth: 24,
    alignItems: 'center',
  },
  badgeText: {
    fontSize: 12,
    fontWeight: 'bold',
  },
});

export default FilterButtons;
