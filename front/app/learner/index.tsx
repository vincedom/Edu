import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

export default function LearnerHomeScreen() {
  return (
    <View style={styles.container}>
      {/* This is where the RobotAvatar and AudioButton will live */}
      <Text style={styles.title}>Edu AI Tutor</Text>
      <Text style={styles.status}>Ready to help you today!</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#111827', // Dark immersive background for the child
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 10,
  },
  status: {
    fontSize: 18,
    color: '#9CA3AF',
  },
});