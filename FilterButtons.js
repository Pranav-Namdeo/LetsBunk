import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';

const FilterButtons = ({ selectedFilter, onFilterChange, counts, theme, paginationLabel }) => {
  const filters = [
    { id: 'all', label: paginationLabel ? `All (${paginationLabel})` : 'All', icon: '📋', count: counts.all },
    { id: 'active', label: 'Active', icon: '🟢', count: counts.active },
    { id: 'present', label: 'Present', icon: '✅', count: counts.present },
    { id: 'absent', label: 'Absent', icon: '❌', count: counts.absent },
  ];

  return (
    <View style={styles.outerContainer}>
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
                  backgroundColor: isSelected ? theme.primary : theme.cardBackground + '80',
                  borderColor: isSelected ? theme.primary : theme.border,
                }
              ]}
              activeOpacity={0.7}
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
                  backgroundColor: isSelected ? 'rgba(255,255,255,0.25)' : theme.primary + '15',
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
    </View>
  );
};

const styles = StyleSheet.create({
  outerContainer: {
    marginVertical: 4,
  },
  container: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    gap: 10,
  },
  filterButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 14,
    borderWidth: 1.5,
    marginRight: 4,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
  },
  icon: {
    fontSize: 15,
    marginRight: 6,
  },
  label: {
    fontSize: 13,
    fontWeight: '700',
    marginRight: 6,
  },
  badge: {
    paddingHorizontal: 7,
    paddingVertical: 1.5,
    borderRadius: 8,
    minWidth: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '800',
  },
});

export default FilterButtons;
