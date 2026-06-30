import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { Shield, GraduationCap } from 'lucide-react-native';

export default function EntryScreen() {
  const router = useRouter();

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Welcome to Edu</Text>
      <Text style={styles.subtitle}>Select your workspace to get started:</Text>

      {/* Route to Learner Interface (Voice-first) */}
      <TouchableOpacity 
        style={[styles.button, styles.learnerButton]} 
        onPress={() => router.push('/learner')}
      >
        <GraduationCap color="white" size={32} />
        <Text style={styles.buttonText}>Learner Space</Text>
      </TouchableOpacity>

      {/* Route to Administration Interface (Parents/Teachers) */}
      <TouchableOpacity 
        style={[styles.button, styles.adminButton]} 
        onPress={() => router.push('/admin/parent')}
      >
        <Shield color="white" size={24} />
        <Text style={styles.buttonText}>Adult Space (Admin)</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F3F4F6',
    padding: 20,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#1F2937',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#6B7280',
    marginBottom: 40,
    textAlign: 'center',
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    padding: 20,
    borderRadius: 16,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  learnerButton: {
    backgroundColor: '#4F46E5', // Vibrant indigo for the learner
  },
  adminButton: {
    backgroundColor: '#374151', // Slate gray for the admin/adults
  },
  buttonText: {
    color: 'white',
    fontSize: 18,
    fontWeight: '600',
    marginLeft: 12,
  },
});