import { useState, useMemo, useCallback } from 'react';
import { CategoriesScreen } from './components/CategoriesScreen';
import { ExerciseListScreen } from './components/ExerciseListScreen';
import { ExerciseDetailScreen } from './components/ExerciseDetailScreen';
import { AddExerciseScreen } from './components/AddExerciseScreen';
import { HomeScreen } from './components/HomeScreen';
import { AnalyticsScreen } from './components/AnalyticsScreen';
import type { Category, Exercise } from './types';

type Screen = 'home' | 'categories' | 'exercises' | 'exercise-detail' | 'add-exercise' | 'analytics';

export default function App() {
  const [screen, setScreen] = useState<Screen>('home');
  const [selectedCategory, setSelectedCategory] = useState<Category | null>(null);
  const [selectedExercise, setSelectedExercise] = useState<Exercise | null>(null);
  const [exercisesRefreshTrigger, setExercisesRefreshTrigger] = useState(0);
  const [addFromCategoriesMode, setAddFromCategoriesMode] = useState(false);

  const sessionId = useMemo(() => `session_${Date.now()}`, []);

  const openCategories = useCallback(() => {
    setScreen('categories');
    setSelectedCategory(null);
    setSelectedExercise(null);
  }, []);

  const openExercises = useCallback((category: Category) => {
    setSelectedCategory(category);
    setScreen('exercises');
    setSelectedExercise(null);
  }, []);

  const openExerciseDetail = useCallback((exercise: Exercise) => {
    setSelectedExercise(exercise);
    setScreen('exercise-detail');
  }, []);

  const openAddExercise = useCallback(() => {
    setScreen('add-exercise');
  }, []);

  const onExerciseAdded = useCallback(() => {
    setScreen('exercises');
    setExercisesRefreshTrigger((t) => t + 1);
  }, []);

  const handleCategorySelect = useCallback(
    (category: Category) => {
      if (addFromCategoriesMode) {
        setSelectedCategory(category);
        setScreen('add-exercise');
        setAddFromCategoriesMode(false);
      } else {
        openExercises(category);
      }
    },
    [addFromCategoriesMode, openExercises]
  );

  if (screen === 'add-exercise' && selectedCategory) {
    return (
      <AddExerciseScreen
        category={selectedCategory}
        onBack={() => setScreen('exercises')}
        onSuccess={onExerciseAdded}
      />
    );
  }

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
        refreshTrigger={exercisesRefreshTrigger}
        onBack={openCategories}
        onSelectExercise={openExerciseDetail}
        onAddExercise={openAddExercise}
      />
    );
  }

  if (screen === 'analytics') {
    return <AnalyticsScreen onBack={() => setScreen('home')} />;
  }

  if (screen === 'home') {
    return (
      <HomeScreen
        onOpenExercises={openCategories}
        onOpenAnalytics={() => setScreen('analytics')}
      />
    );
  }

  return (
    <CategoriesScreen
      addMode={addFromCategoriesMode}
      onBack={() => {
        setScreen('home');
        setAddFromCategoriesMode(false);
      }}
      onSelectCategory={handleCategorySelect}
      onAddExercise={() => setAddFromCategoriesMode(true)}
    />
  );
}
