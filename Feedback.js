import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, TextInput } from 'react-native';

export default function Feedback({ theme, onBack }) {
  const [rating, setRating] = useState(0);
  const [feedbackType, setFeedbackType] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [email, setEmail] = useState("");
  const [isSubmitted, setIsSubmitted] = useState(false);

  const feedbackTypes = [
    { id: "bug", label: "Bug Report", emoji: "🐛" },
    { id: "feature", label: "Feature Request", emoji: "💡" },
    { id: "improvement", label: "Improvement", emoji: "⚡" },
    { id: "compliment", label: "Compliment", emoji: "❤️" },
    { id: "other", label: "Other", emoji: "💬" },
  ];

  const handleSubmit = () => {
    if (!isFormValid) return;
    
    // Handle form submission here
    setIsSubmitted(true);
    
    // Reset form after 3 seconds
    setTimeout(() => {
      setIsSubmitted(false);
      setRating(0);
      setFeedbackType("");
      setSubject("");
      setMessage("");
      setEmail("");
    }, 3000);
  };

  const isFormValid = rating > 0 && feedbackType && subject && message;

  const getRatingText = (rating) => {
    switch (rating) {
      case 1: return "Poor - We'll work to improve";
      case 2: return "Fair - There's room for improvement";
      case 3: return "Good - We're getting there";
      case 4: return "Very Good - Glad you like it!";
      case 5: return "Excellent - Thank you!";
      default: return "";
    }
  };

  if (isSubmitted) {
    return (
      <View style={[styles.container, { backgroundColor: theme.background }]}>
        {/* Header */}
        <View style={[styles.header, { backgroundColor: theme.cardBackground, borderBottomColor: theme.border }]}>
          <TouchableOpacity onPress={onBack} style={styles.backButton}>
            <Text style={{ fontSize: 24 }}>←</Text>
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: theme.text }]}>Feedback</Text>
        </View>

        {/* Success Message */}
        <View style={styles.successContainer}>
          <View style={styles.successCircle}>
            <Text style={{ fontSize: 64 }}>✓</Text>
          </View>
          <Text style={[styles.successTitle, { color: theme.text }]}>Thank You!</Text>
          <Text style={[styles.successSubtitle, { color: theme.textSecondary }]}>
            Your feedback has been submitted successfully. We appreciate your input and will review it shortly.
          </Text>
          <TouchableOpacity
            onPress={onBack}
            style={[styles.successButton, { backgroundColor: theme.primary }]}
          >
            <Text style={styles.successButtonText}>Back to Home</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: theme.cardBackground, borderBottomColor: theme.border }]}>
        <TouchableOpacity onPress={onBack} style={styles.backButton}>
          <Text style={{ fontSize: 24 }}>←</Text>
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: theme.text }]}>Feedback</Text>
      </View>

      {/* Main Content */}
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        {/* Introduction */}
        <View style={[styles.introCard, { backgroundColor: theme.primary }]}>
          <Text style={styles.introTitle}>We'd Love Your Feedback!</Text>
          <Text style={styles.introSubtitle}>
            Help us improve LetsBunk by sharing your thoughts, reporting bugs, or suggesting new features.
          </Text>
        </View>

        {/* Rating Section */}
        <View style={[styles.card, { backgroundColor: theme.cardBackground, borderColor: theme.border }]}>
          <Text style={[styles.cardLabel, { color: theme.text }]}>How would you rate your experience?</Text>
          <View style={styles.ratingContainer}>
            {[1, 2, 3, 4, 5].map((star) => (
              <TouchableOpacity
                key={star}
                onPress={() => setRating(star)}
                style={styles.starButton}
              >
                <Text style={[styles.star, { color: star <= rating ? '#fbbf24' : '#d1d5db' }]}>★</Text>
              </TouchableOpacity>
            ))}
          </View>
          {rating > 0 && (
            <Text style={[styles.ratingText, { color: theme.textSecondary }]}>
              {getRatingText(rating)}
            </Text>
          )}
        </View>

        {/* Feedback Type */}
        <View style={[styles.card, { backgroundColor: theme.cardBackground, borderColor: theme.border }]}>
          <Text style={[styles.cardLabel, { color: theme.text }]}>What type of feedback is this?</Text>
          <View style={styles.typeGrid}>
            {feedbackTypes.map((type) => (
              <TouchableOpacity
                key={type.id}
                onPress={() => setFeedbackType(type.id)}
                style={[
                  styles.typeButton,
                  {
                    borderColor: feedbackType === type.id ? theme.primary : theme.border,
                    backgroundColor: feedbackType === type.id ? theme.primary + '10' : 'transparent',
                  }
                ]}
              >
                <Text style={styles.typeEmoji}>{type.emoji}</Text>
                <Text style={[
                  styles.typeLabel,
                  { color: feedbackType === type.id ? theme.primary : theme.text }
                ]}>
                  {type.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Subject */}
        <View style={[styles.card, { backgroundColor: theme.cardBackground, borderColor: theme.border }]}>
          <Text style={[styles.cardLabel, { color: theme.text }]}>Subject</Text>
          <TextInput
            style={[styles.input, { color: theme.text, borderColor: theme.border }]}
            placeholder="Brief summary of your feedback"
            placeholderTextColor={theme.textSecondary + '80'}
            value={subject}
            onChangeText={setSubject}
          />
        </View>

        {/* Message */}
        <View style={[styles.card, { backgroundColor: theme.cardBackground, borderColor: theme.border }]}>
          <Text style={[styles.cardLabel, { color: theme.text }]}>Your Feedback</Text>
          <TextInput
            style={[styles.textArea, { color: theme.text, borderColor: theme.border }]}
            placeholder="Please provide detailed feedback. The more information you share, the better we can help!"
            placeholderTextColor={theme.textSecondary + '80'}
            value={message}
            onChangeText={setMessage}
            multiline
            numberOfLines={6}
            textAlignVertical="top"
          />
          <Text style={[styles.charCount, { color: theme.textSecondary }]}>
            {message.length} / 500 characters
          </Text>
        </View>

        {/* Email (Optional) */}
        <View style={[styles.card, { backgroundColor: theme.cardBackground, borderColor: theme.border }]}>
          <Text style={[styles.cardLabel, { color: theme.text }]}>
            Email Address <Text style={[styles.optional, { color: theme.textSecondary }]}>(Optional)</Text>
          </Text>
          <TextInput
            style={[styles.input, { color: theme.text, borderColor: theme.border }]}
            placeholder="your.email@example.com"
            placeholderTextColor={theme.textSecondary + '80'}
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
          />
          <Text style={[styles.hint, { color: theme.textSecondary }]}>
            We'll only use this to follow up on your feedback if needed
          </Text>
        </View>

        {/* Submit Button */}
        <TouchableOpacity
          onPress={handleSubmit}
          disabled={!isFormValid}
          style={[
            styles.submitButton,
            {
              backgroundColor: isFormValid ? theme.primary : theme.border,
              opacity: isFormValid ? 1 : 0.5,
            }
          ]}
        >
          <Text style={{ fontSize: 16, marginRight: 8 }}>📤</Text>
          <Text style={styles.submitButtonText}>Submit Feedback</Text>
        </TouchableOpacity>

        {!isFormValid && (
          <Text style={[styles.validationText, { color: theme.textSecondary }]}>
            Please complete all required fields to submit
          </Text>
        )}

        {/* Privacy Note */}
        <View style={styles.privacyNote}>
          <Text style={[styles.privacyText, { color: theme.textSecondary }]}>
            Your feedback is valuable to us. We respect your privacy and will never share your information with third parties.
          </Text>
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
  introCard: {
    padding: 24,
    marginBottom: 24,
  },
  introTitle: {
    fontSize: 24,
    fontWeight: '600',
    color: '#ffffff',
    marginBottom: 8,
  },
  introSubtitle: {
    fontSize: 14,
    color: '#ffffff',
    opacity: 0.9,
    lineHeight: 20,
  },
  card: {
    marginHorizontal: 24,
    marginBottom: 24,
    borderRadius: 12,
    padding: 24,
    borderWidth: 1,
  },
  cardLabel: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
  },
  ratingContainer: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
  },
  starButton: {
    padding: 4,
  },
  star: {
    fontSize: 40,
  },
  ratingText: {
    fontSize: 14,
    marginTop: 8,
  },
  typeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  typeButton: {
    width: '47%',
    padding: 16,
    borderRadius: 12,
    borderWidth: 2,
    alignItems: 'center',
  },
  typeEmoji: {
    fontSize: 32,
    marginBottom: 8,
  },
  typeLabel: {
    fontSize: 14,
    fontWeight: '500',
  },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 14,
  },
  textArea: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 14,
    minHeight: 120,
  },
  charCount: {
    fontSize: 12,
    marginTop: 8,
  },
  optional: {
    fontSize: 14,
    fontWeight: '400',
  },
  hint: {
    fontSize: 12,
    marginTop: 8,
    lineHeight: 16,
  },
  submitButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 24,
    paddingVertical: 16,
    borderRadius: 12,
    marginBottom: 12,
  },
  submitButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  validationText: {
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 16,
  },
  privacyNote: {
    marginHorizontal: 24,
    marginBottom: 24,
  },
  privacyText: {
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 16,
  },
  successContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  successCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#10b981' + '20',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  successTitle: {
    fontSize: 24,
    fontWeight: '600',
    marginBottom: 12,
  },
  successSubtitle: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 32,
  },
  successButton: {
    paddingHorizontal: 32,
    paddingVertical: 16,
    borderRadius: 12,
  },
  successButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
});
