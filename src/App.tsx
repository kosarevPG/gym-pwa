import { useState, useMemo, useCallback, useEffect } from 'react';
import { CategoriesScreen } from './components/CategoriesScreen';
import { ExerciseListScreen } from './components/ExerciseListScreen';
import { ExerciseDetailScreen } from './components/ExerciseDetailScreen';
import { AddExerciseScreen } from './components/AddExerciseScreen';
import { HomeScreenBento } from './components/HomeScreenBento';
import { AnalyticsScreen } from './components/AnalyticsScreen';
import { HistoryScreen } from './components/HistoryScreen';
import { SessionEditScreen } from './components/SessionEditScreen';
import { ExerciseHistoryScreen } from './components/ExerciseHistoryScreen';
import { WorkoutSummaryScreen } from './components/WorkoutSummaryScreen';
import { getCategoryBySlug } from './data/categories';
import { deleteExercise, getActiveWorkoutSession, createWorkoutSession } from './lib/api';
import type { Category, Exercise } from './types';

type Screen = 'home' | 'categories' | 'exercises' | 'exercise-detail' | 'add-exercise' | 'edit-exercise' | 'analytics' | 'history' | 'session-edit' | 'exercise-history' | 'summary';

export default function App() {
  const [screen, setScreen] = useState<Screen>('home');
  const [selectedCategory, setSelectedCategory] = useState<Category | null>(null);
  const [selectedExercise, setSelectedExercise] = useState<Exercise | null>(null);
  const [exercisesRefreshTrigger, setExercisesRefreshTrigger] = useState(0);
  const [addFromCategoriesMode, setAddFromCategoriesMode] = useState(false);
  const [summarySessionId, setSummarySessionId] = useState<string | null>(null);
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [editingSessionDate, setEditingSessionDate] = useState<string | undefined>(undefined);
  const [openAddExerciseWhenSessionEdit, setOpenAddExerciseWhenSessionEdit] = useState(false);
  /** true = зашли в редактирование сессии после «Завершить упражнение» (назад — в категории). */
  const [sessionEditFromWorkout, setSessionEditFromWorkout] = useState(false);
  /** true = зашли в «Текущая тренировка» с главной по кнопке «Продолжить» (назад — на главную). */
  const [sessionEditFromHome, setSessionEditFromHome] = useState(false);
  /** С какого экрана открыли историю упражнения (назад вернёмся туда). */
  const [historyFromScreen, setHistoryFromScreen] = useState<Screen | null>(null);
  /** Упражнение, которое нужно добавить в сессию при открытии экрана текущей тренировки (из меню Упражнения). */
  const [exerciseToAddOnMount, setExerciseToAddOnMount] = useState<Exercise | null>(null);
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

  /** Вернуть текущую активную сессию или создать новую (авто-старт тренировки из меню Упражнения). */
  const ensureWorkoutSession = useCallback(async (): Promise<string> => {
    const active = await getActiveWorkoutSession();
    if (active) return active.id;
    const result = await createWorkoutSession();
    if ('error' in result) throw new Error(result.error.message);
    setSessionId(result.id);
    return result.id;
  }, []);

  /** Выбор упражнения из списка: добавляем в текущую/новую сессию и открываем экран «Текущая тренировка» (новая карточка). */
  const openExerciseDetail = useCallback(
    async (exercise: Exercise) => {
      try {
        const sid = await ensureWorkoutSession();
        setSessionId(sid);
        setEditingSessionId(sid);
        setExerciseToAddOnMount(exercise);
        setSessionEditFromWorkout(true);
        setSessionEditFromHome(false);
        setOpenAddExerciseWhenSessionEdit(false);
        setScreen('session-edit');
      } catch (e) {
        alert(e instanceof Error ? e.message : 'Не удалось начать тренировку');
      }
    },
    [ensureWorkoutSession]
  );

  const openAddExercise = useCallback(() => {
    setScreen('add-exercise');
  }, []);

  const onExerciseAdded = useCallback(() => {
    setScreen('exercises');
    setExercisesRefreshTrigger((t) => t + 1);
  }, []);

  const handleEditExercise = useCallback((exercise?: Exercise) => {
    if (exercise != null) setSelectedExercise(exercise);
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
          setEditingSessionId(sessionId);
          setEditingSessionDate(undefined);
          setOpenAddExerciseWhenSessionEdit(true);
          setSessionEditFromWorkout(true);
          setSessionEditFromHome(false);
          setScreen('session-edit');
        }}
        onEnsureSession={ensureWorkoutSession}
        onEditExercise={handleEditExercise}
        onDeleteExercise={handleDeleteExercise}
        onOpenHistory={() => {
          setHistoryFromScreen('exercise-detail');
          setScreen('exercise-history');
        }}
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
    return (
      <HistoryScreen
        onBack={() => setScreen('home')}
        onEditSession={(sid, date) => {
          setEditingSessionId(sid);
          setEditingSessionDate(date);
          setSessionEditFromWorkout(false);
          setSessionEditFromHome(false);
          setOpenAddExerciseWhenSessionEdit(false);
          setScreen('session-edit');
        }}
      />
    );
  }

  if (screen === 'session-edit' && editingSessionId) {
    return (
      <SessionEditScreen
        sessionId={editingSessionId}
        sessionDate={editingSessionDate}
        onBack={() => {
          const fromHome = sessionEditFromHome;
          const fromWorkout = sessionEditFromWorkout;
          setEditingSessionId(null);
          setEditingSessionDate(undefined);
          setOpenAddExerciseWhenSessionEdit(false);
          setSessionEditFromWorkout(false);
          setSessionEditFromHome(false);
          setExerciseToAddOnMount(null);
          setScreen(fromHome ? 'home' : fromWorkout ? 'categories' : 'history');
        }}
        openAddExerciseOnMount={openAddExerciseWhenSessionEdit}
        onAddExerciseOpenConsumed={() => setOpenAddExerciseWhenSessionEdit(false)}
        exerciseToAddOnMount={exerciseToAddOnMount}
        onExerciseAddedToSession={() => setExerciseToAddOnMount(null)}
        onEditExercise={handleEditExercise}
        onOpenExerciseHistory={(ex) => {
          setSelectedExercise(ex);
          setHistoryFromScreen('session-edit');
          setScreen('exercise-history');
        }}
      />
    );
  }

  if (screen === 'exercise-history' && selectedExercise) {
    return (
      <ExerciseHistoryScreen
        exercise={selectedExercise}
        onBack={() => {
          setScreen(historyFromScreen ?? 'home');
          setHistoryFromScreen(null);
        }}
      />
    );
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
        onOpenCurrentSession={(id) => {
          setEditingSessionId(id);
          setEditingSessionDate(undefined);
          setOpenAddExerciseWhenSessionEdit(false);
          setSessionEditFromWorkout(false);
          setSessionEditFromHome(true);
          setScreen('session-edit');
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
