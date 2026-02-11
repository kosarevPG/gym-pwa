import { useState, useMemo } from 'react';
import { CategoriesScreen } from './components/CategoriesScreen';
import { ExerciseListScreen } from './components/ExerciseListScreen';
import { ExerciseDetailScreen } from './components/ExerciseDetailScreen';
import type { Category, Exercise } from './types';

type Screen = 'categories' | 'exercises' | 'exercise-detail';

export default function App() {
  const [screen, setScreen] = useState<Screen>('categories');
  const [selectedCategory, setSelectedCategory] = useState<Category | null>(null);
  const [selectedExercise, setSelectedExercise] = useState<Exercise | null>(null);

  const sessionId = useMemo(() => `session_${Date.now()}`, []);

  const openCategories = () => {
    setScreen('categories');
    setSelectedCategory(null);
    setSelectedExercise(null);
  };

  const openExercises = (category: Category) => {
    setSelectedCategory(category);
    setScreen('exercises');
    setSelectedExercise(null);
  };

  const openExerciseDetail = (exercise: Exercise) => {
    setSelectedExercise(exercise);
    setScreen('exercise-detail');
  };

  if (screen === 'exercise-detail' && selectedExercise) {
    return (
      <ExerciseDetailScreen
        exercise={selectedExercise}
        sessionId={sessionId}
        onBack={() => setScreen('exercises')}
        onComplete={() => setScreen('exercises')}
      />
    );
  }

  if (screen === 'exercises' && selectedCategory) {
    return (
      <ExerciseListScreen
        category={selectedCategory}
        onBack={openCategories}
        onSelectExercise={openExerciseDetail}
      />
    );
  }

  return (
    <CategoriesScreen
      onClose={() => {}}
      onSelectCategory={openExercises}
    />
  );
}
