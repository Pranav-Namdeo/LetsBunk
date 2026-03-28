import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, TextInput } from 'react-native';

export default function HelpAndSupport({ theme, onBack }) {
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedFaq, setExpandedFaq] = useState(null);

  const quickHelpCards = [
    { icon: "📖", title: "User Guide", description: "Learn how to use all features", color: "#3b82f6" },
    { icon: "🎥", title: "Video Tutorials", description: "Watch step-by-step guides", color: "#8b5cf6" },
    { icon: "📄", title: "Documentation", description: "Browse technical docs", color: "#10b981" },
    { icon: "❓", title: "FAQs", description: "Find quick answers", color: "#f59e0b" },
  ];

  const faqs = [
    {
      question: "How do I mark attendance for students?",
      answer: "You can mark attendance by viewing the student list on the home tab. Each student card shows their current status (Active, Present, Absent, or Left Early). Click on any student to view their detailed profile and attendance history.",
    },
    {
      question: "How does the Random Ring feature work?",
      answer: "The Random Ring feature (bell icon) allows you to randomly select a student from your class. Click the floating bell button on the home screen, and the system will randomly pick a student for you to call upon.",
    },
    {
      question: "Can I view attendance records by semester and branch?",
      answer: "Yes! Click on the three-dot menu and select 'View Records'. You can then filter students by selecting a specific semester and branch from the dropdown menus.",
    },
    {
      question: "How do I switch between light and dark mode?",
      answer: "Click the theme toggle button (sun/moon icon) located in the header next to the three-dot menu. The app will instantly switch between light and dark themes.",
    },
    {
      question: "What do the different student status badges mean?",
      answer: "Active (Green): Student is currently in class. Present (Blue): Student has been marked present. Absent (Red): Student has not joined the class. Left Early (Orange): Student left before the class ended.",
    },
    {
      question: "How can I search for a specific student?",
      answer: "Use the search bar below the header on the home tab. You can search for students by their name or roll number.",
    },
    {
      question: "Can I see how long a student has been in class?",
      answer: "Yes, each student card displays a timer showing how long they have been in the class since they joined.",
    },
    {
      question: "How do I update my teacher profile?",
      answer: "Click on your profile picture in the top-left corner of the header to view and edit your profile information.",
    },
  ];

  const contactOptions = [
    { icon: "📧", title: "Email Support", value: "support@letsbunk.edu", action: "Send Email", color: "#3b82f6" },
    { icon: "📞", title: "Phone Support", value: "+1 (555) 123-4567", action: "Call Now", color: "#10b981" },
    { icon: "💬", title: "Live Chat", value: "Available 24/7", action: "Start Chat", color: "#8b5cf6" },
  ];

  const filteredFaqs = searchQuery
    ? faqs.filter(
        (faq) =>
          faq.question.toLowerCase().includes(searchQuery.toLowerCase()) ||
          faq.answer.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : faqs;

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: theme.cardBackground, borderBottomColor: theme.border }]}>
        <TouchableOpacity onPress={onBack} style={styles.backButton}>
          <Text style={{ fontSize: 24 }}>←</Text>
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: theme.text }]}>Help & Support</Text>
      </View>

      {/* Main Content */}
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        {/* Welcome Section */}
        <View style={[styles.welcomeCard, { backgroundColor: theme.primary }]}>
          <Text style={styles.welcomeTitle}>How can we help you?</Text>
          <Text style={styles.welcomeSubtitle}>Search our knowledge base or contact our support team</Text>
          <TextInput
            style={styles.searchInput}
            placeholder="Search for help..."
            placeholderTextColor="#666"
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
        </View>

        {/* Quick Help Cards */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>Quick Help</Text>
          <View style={styles.quickHelpGrid}>
            {quickHelpCards.map((card, index) => (
              <TouchableOpacity
                key={index}
                style={[styles.quickHelpCard, { backgroundColor: theme.cardBackground, borderColor: theme.border }]}
              >
                <View style={[styles.quickHelpIcon, { backgroundColor: card.color + '20' }]}>
                  <Text style={{ fontSize: 24 }}>{card.icon}</Text>
                </View>
                <Text style={[styles.quickHelpTitle, { color: theme.text }]}>{card.title}</Text>
                <Text style={[styles.quickHelpDesc, { color: theme.textSecondary }]}>{card.description}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* FAQs Section */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>Frequently Asked Questions</Text>
          {filteredFaqs.length > 0 ? (
            <View style={[styles.faqContainer, { backgroundColor: theme.cardBackground, borderColor: theme.border }]}>
              {filteredFaqs.map((faq, index) => (
                <View key={index}>
                  <TouchableOpacity
                    style={styles.faqItem}
                    onPress={() => setExpandedFaq(expandedFaq === index ? null : index)}
                  >
                    <Text style={[styles.faqQuestion, { color: theme.text }]}>{faq.question}</Text>
                    <Text style={{ fontSize: 16, color: theme.textSecondary }}>
                      {expandedFaq === index ? '▼' : '▶'}
                    </Text>
                  </TouchableOpacity>
                  {expandedFaq === index && (
                    <View style={styles.faqAnswer}>
                      <Text style={[styles.faqAnswerText, { color: theme.textSecondary }]}>{faq.answer}</Text>
                    </View>
                  )}
                  {index < filteredFaqs.length - 1 && (
                    <View style={[styles.faqDivider, { backgroundColor: theme.border }]} />
                  )}
                </View>
              ))}
            </View>
          ) : (
            <View style={[styles.noResults, { backgroundColor: theme.cardBackground, borderColor: theme.border }]}>
              <Text style={[styles.noResultsText, { color: theme.textSecondary }]}>
                No results found for "{searchQuery}"
              </Text>
            </View>
          )}
        </View>

        {/* Contact Support Section */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>Contact Support</Text>
          {contactOptions.map((option, index) => (
            <View
              key={index}
              style={[styles.contactCard, { backgroundColor: theme.cardBackground, borderColor: theme.border }]}
            >
              <View style={[styles.contactIcon, { backgroundColor: option.color + '20' }]}>
                <Text style={{ fontSize: 24 }}>{option.icon}</Text>
              </View>
              <View style={styles.contactInfo}>
                <Text style={[styles.contactTitle, { color: theme.text }]}>{option.title}</Text>
                <Text style={[styles.contactValue, { color: theme.textSecondary }]}>{option.value}</Text>
              </View>
              <TouchableOpacity style={[styles.contactButton, { borderColor: theme.border }]}>
                <Text style={[styles.contactButtonText, { color: theme.text }]}>{option.action}</Text>
                <Text style={{ fontSize: 12, color: theme.textSecondary }}>▶</Text>
              </TouchableOpacity>
            </View>
          ))}
        </View>

        {/* Additional Resources */}
        <View style={[styles.section, { marginBottom: 24 }]}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>Additional Resources</Text>
          <View style={[styles.resourcesCard, { backgroundColor: theme.cardBackground, borderColor: theme.border }]}>
            {['Terms of Service', 'Privacy Policy', 'Community Guidelines', 'Report a Bug'].map((item, index) => (
              <TouchableOpacity
                key={index}
                style={[styles.resourceItem, index < 3 && { borderBottomWidth: 1, borderBottomColor: theme.border }]}
              >
                <Text style={[styles.resourceText, { color: theme.text }]}>{item}</Text>
                <Text style={{ fontSize: 16, color: theme.textSecondary }}>▶</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* App Version */}
        <View style={styles.versionInfo}>
          <Text style={[styles.versionText, { color: theme.textSecondary }]}>LetsBunk Teacher Panel v1.2.0</Text>
          <Text style={[styles.copyrightText, { color: theme.textSecondary }]}>© 2024 LetsBunk. All rights reserved.</Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 16,
    paddingTop: 50,
    borderBottomWidth: 1,
  },
  backButton: {
    padding: 8,
    marginRight: 16,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '600',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 24,
  },
  welcomeCard: {
    padding: 24,
    marginBottom: 24,
  },
  welcomeTitle: {
    fontSize: 24,
    fontWeight: '600',
    color: '#ffffff',
    marginBottom: 8,
  },
  welcomeSubtitle: {
    fontSize: 14,
    color: '#ffffff',
    opacity: 0.9,
    marginBottom: 16,
  },
  searchInput: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 14,
  },
  section: {
    paddingHorizontal: 24,
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 16,
  },
  quickHelpGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
  },
  quickHelpCard: {
    width: '47%',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
  },
  quickHelpIcon: {
    width: 48,
    height: 48,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  quickHelpTitle: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 4,
  },
  quickHelpDesc: {
    fontSize: 12,
    lineHeight: 16,
  },
  faqContainer: {
    borderRadius: 12,
    borderWidth: 1,
    overflow: 'hidden',
  },
  faqItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
  },
  faqQuestion: {
    flex: 1,
    fontSize: 14,
    fontWeight: '500',
    marginRight: 12,
  },
  faqAnswer: {
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  faqAnswerText: {
    fontSize: 14,
    lineHeight: 20,
  },
  faqDivider: {
    height: 1,
  },
  noResults: {
    borderRadius: 12,
    padding: 32,
    borderWidth: 1,
    alignItems: 'center',
  },
  noResultsText: {
    fontSize: 14,
  },
  contactCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    padding: 20,
    borderWidth: 1,
    marginBottom: 16,
  },
  contactIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  contactInfo: {
    flex: 1,
  },
  contactTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  contactValue: {
    fontSize: 14,
  },
  contactButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
  },
  contactButtonText: {
    fontSize: 14,
    fontWeight: '500',
  },
  resourcesCard: {
    borderRadius: 12,
    borderWidth: 1,
    overflow: 'hidden',
  },
  resourceItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
  },
  resourceText: {
    fontSize: 14,
  },
  versionInfo: {
    alignItems: 'center',
    paddingVertical: 16,
  },
  versionText: {
    fontSize: 12,
    marginBottom: 4,
  },
  copyrightText: {
    fontSize: 10,
  },
});
