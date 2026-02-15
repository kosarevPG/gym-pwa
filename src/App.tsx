import { useState, useMemo, useCallback, useEffect } from 'react';
import { CategoriesScreen } from './components/CategoriesScreen';
import { ExerciseListScreen } from './components/ExerciseListScreen';
import { ExerciseDetailScreen } from './components/ExerciseDetailScreen';
import { AddExerciseScreen } from './components/AddExerciseScreen';
import { HomeScreenBento } from './components/HomeScreenBento';
import { AnalyticsScreen } from './components/AnalyticsScreen';
import { HistoryScreen } from './components/HistoryScreen';
import { WorkoutSummaryScreen } from './components/WorkoutSummaryScreen';
import { getCategoryBySlug } from './data/categories';
import { deleteExercise, getActiveWorkoutSession } from './lib/api';
import type { Category, Exercise } from './types';

type Screen = 'home' | 'categories' | 'exercises' | 'exercise-detail' | 'add-exercise' | 'edit-exercise' | 'analytics' | 'history' | 'summary';

export default function App() {
  const [screen, setScreen] = useState<Screen>('home');
  const [selectedCategory, setSelectedCategory] = useState<Category | null>(null);
  const [selectedExercise, setSelectedExercise] = useState<Exercise | null>(null);
  const [exercisesRefreshTrigger, setExercisesRefreshTrigger] = useState(0);
  const [addFromCategoriesMode, setAddFromCategoriesMode] = useState(false);
  const [summarySessionId, setSummarySessionId] = useState<string | null>(null);
  const [lastExerciseInSession, setLastExerciseInSession] = useState<{ exercise: Exercise; category: Category } | null>(null);

  const [sessionId, setSessionId] = useState<string>(() => `session_${Date.now()}`);

  useEffect(() => {
    getActiveWorkoutSession().then((active) => {
      // #region agent log
      if (active) fetch('http://127.0.0.1:7243/ingest/130ec4b2-2362-4843-83f6-f116f6403005', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'App.tsx:useEffect', message: 'getActiveWorkoutSession result', data: { sessionId: active.id, started_at: active.started_at }, timestamp: Date.now(), hypothesisId: 'H1' }) }).catch(() => {});
      // #endregion
      if (active) setSessionId(active.id);
    }).catch(() => {});
  }, []);

  const openCategories = useCallback(() => {
    setScreen('categories');
    setSelectedCategory(null);
    setSelectedExercise(null);
  }, []);

  const resumeOrOpenCategories = useCallback(() => {
    if (lastExerciseInSession) {
      setSelectedExercise(lastExerciseInSession.exercise);
      setSelectedCategory(lastExerciseInSession.category);
      setScreen('exercise-detail');
    } else {
      openCategories();
    }
  }, [lastExerciseInSession, openCategories]);

  const openExercises = useCallback((category: Category) => {
    setSelectedCategory(category);
    setScreen('exercises');
    setSelectedExercise(null);
  }, []);

  const openExerciseDetail = useCallback((exercise: Exercise) => {
    setSelectedExercise(exercise);
    setScreen('exercise-detail');
    const category = getCategoryBySlug(exercise.category) ?? selectedCategory ?? { slug: exercise.category, name: exercise.category };
    setLastExerciseInSession({ exercise, category });
  }, [selectedCategory]);

  const openAddExercise = useCallback(() => {
    setScreen('add-exercise');
  }, []);

  const onExerciseAdded = useCallback(() => {
    setScreen('exercises');
    setExercisesRefreshTrigger((t) => t + 1);
  }, []);

  const handleEditExercise = useCallback(() => {
    setScreen('edit-exercise');
  }, []);

  const handleEditSuccess = useCallback((updated: Exercise) => {
    setSelectedExercise(updated);
    setExercisesRefreshTrigger((t) => t + 1);
    setScreen('exercises');
  }, []);

  const handleDeleteExercise = useCallback(async (exercise: Exercise) => {
    const { error } = await deleteExercise(exercise.id);
    if (error) {
      alert(error.message);
      return;
    }
    setScreen('exercises');
    setSelectedExercise(null);
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
        onComplete={() => {
          setLastExerciseInSession(null);
          setScreen('exercises');
        }}
        onEditExercise={handleEditExercise}
        onDeleteExercise={handleDeleteExercise}
      />
    );
  }

  if (screen === 'edit-exercise' && selectedExercise) {
    const category = getCategoryBySlug(selectedExercise.category) ?? {
      slug: selectedExercise.category,
      name: selectedExercise.category,
    };
    return (
      <AddExerciseScreen
        category={category}
        initialExercise={selectedExercise}
        onBack={() => setScreen('exercise-detail')}
        onSuccess={handleEditSuccess}
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

  if (screen === 'history') {
    return <HistoryScreen onBack={() => setScreen('home')} />;
  }

  if (screen === 'summary' && summarySessionId) {
    return (
      <WorkoutSummaryScreen
        sessionId={summarySessionId}
        onGoHome={() => {
          setSummarySessionId(null);
          setScreen('home');
        }}
      />
    );
  }

  if (screen === 'home') {
    return (
      <HomeScreenBento
        onOpenExercises={resumeOrOpenCategories}
        onOpenAnalytics={() => setScreen('analytics')}
        onOpenHistory={() => setScreen('history')}
        onSessionStarted={(id) => {
          setSessionId(id);
          openCategories();
        }}
        onWorkoutFinished={(id) => {
          setSummarySessionId(id);
          setLastExerciseInSession(null);
          setScreen('summary');
        }}
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
      onSelectExercise={openExerciseDetail}
      onAddExercise={() => setAddFromCategoriesMode(true)}
    />
  );
}
