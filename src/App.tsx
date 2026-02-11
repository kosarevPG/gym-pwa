import { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';
import { WORKOUT_STORAGE_KEY } from './constants';
import { getQueue, addToQueue } from './offlineSync';

// Используем именованные импорты для ваших компонентов
import { ScreenHeader } from './components/ScreenHeader';
import { SetDisplayRow } from './components/SetDisplayRow';

const supabaseUrl = 'https://iabklvkzdffwwrlugiwr.supabase.co';
const supabaseKey = 'sb_publishable_49iEmfAfFsckdE00zqsXJw_dKr-AuGD';
const supabase = createClient(supabaseUrl, supabaseKey);

export default function App() {
  const [activeWorkout, setActiveWorkout] = useState<any>(null);

  useEffect(() => {
    const saved = localStorage.getItem(WORKOUT_STORAGE_KEY);
    if (saved) {
      try {
        setActiveWorkout(JSON.parse(saved));
      } catch (e) {
        console.error("Failed to parse workout", e);
      }
    }
  }, []);

  const handleAddSet = async (exId: string, weight: number, reps: number) => {
    const newSet = {
      exercise_id: exId,
      weight,
      reps,
      set_group_id: activeWorkout?.id || 'session_' + Date.now(),
      order: (activeWorkout?.sets?.length || 0) + 1
    };

    try {
      const { error } = await supabase.from('training_logs').insert([
        {
          exercise_id: newSet.exercise_id,
          weight: newSet.weight,
          reps: newSet.reps,
          set_group_id: newSet.set_group_id,
          order_index: newSet.order
        }
      ]);
      if (error) throw error;
    } catch (err) {
      addToQueue('saveSet', newSet);
    }
    
    const updated = {
      ...activeWorkout,
      id: newSet.set_group_id,
      sets: [...(activeWorkout?.sets || []), { ...newSet, completed: true }]
    };
    setActiveWorkout(updated);
    localStorage.setItem(WORKOUT_STORAGE_KEY, JSON.stringify(updated));
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <ScreenHeader title="Sasha Gym" onBack={() => {}} />
      <main className="p-4 max-w-lg mx-auto">
        <button 
          onClick={() => handleAddSet('test-id', 80, 10)}
          className="w-full p-4 bg-zinc-900 border border-zinc-800 rounded-2xl flex justify-between"
        >
          <span>Тестовый жим</span>
          <span className="text-blue-500">+</span>
        </button>
        <div className="mt-6 space-y-2">
          {activeWorkout?.sets?.map((s: any, i: number) => (
            <SetDisplayRow key={i} weight={s.weight} reps={s.reps} rest={0} className="bg-zinc-900 p-3 rounded-xl" />
          ))}
        </div>
      </main>
    </div>
  );
}
