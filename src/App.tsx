import React, { useState, useEffect, useRef } from 'react';
import { createClient } from '@supabase/supabase-js';
import { EXERCISES, MuscleGroup } from './exerciseConfig';
import { MUSCLE_GROUP_ORDER, WORKOUT_STORAGE_KEY } from './constants';
import { addToQueue, getQueue } from './offlineSync';
import { createInitialWorkoutState } from './utils';

// Компоненты (убедитесь, что они лежат в src/components)
import ScreenHeader from './components/ScreenHeader';
import SetDisplayRow from './components/SetDisplayRow';

// Инициализация Supabase
const supabaseUrl = 'https://iabklvkzdffwwrlugiwr.supabase.co';
const supabaseKey = 'sb_publishable_49iEmfAfFsckdE00zqsXJw_dKr-AuGD';
const supabase = createClient(supabaseUrl, supabaseKey);

const api = {
  // Сохранение подхода в Supabase
  saveSet: async (setData: any) => {
    try {
      const { data, error } = await supabase
        .from('training_logs')
        .insert([{
          exercise_id: setData.exercise_id,
          weight: setData.weight,
          reps: setData.reps,
          set_group_id: setData.set_group_id,
          order_index: setData.order
        }]);
      
      if (error) throw error;
      return { status: 'success' };
    } catch (err) {
      console.error('Offline mode: saving to queue');
      addToQueue('saveSet', setData);
      return { status: 'queued', offline: true };
    }
  },

  // Получение истории (для аналитики)
  getHistory: async () => {
    const { data, error } = await supabase
      .from('training_logs')
      .select('*')
      .order('created_at', { ascending: false });
    return data || [];
  }
};

export default function App() {
  const [activeWorkout, setActiveWorkout] = useState<any>(null);
  const [isSyncing, setIsSyncing] = useState(false);

  // Восстановление тренировки из localStorage при запуске
  useEffect(() => {
    const saved = localStorage.getItem(WORKOUT_STORAGE_KEY);
    if (saved) {
      setActiveWorkout(JSON.parse(saved));
    }
  }, []);

  // Синхронизация офлайн-очереди при появлении сети
  useEffect(() => {
    const syncOfflineData = async () => {
      const queue = getQueue();
      if (queue.length > 0 && navigator.onLine) {
        setIsSyncing(true);
        // Логика переотправки данных из очереди
        setIsSyncing(false);
      }
    };
    window.addEventListener('online', syncOfflineData);
    return () => window.removeEventListener('online', syncOfflineData);
  }, []);

  const handleAddSet = async (exId: string, weight: number, reps: number) => {
    const newSet = {
      exercise_id: exId,
      weight,
      reps,
      set_group_id: activeWorkout?.id || 'session_' + Date.now(),
      order: (activeWorkout?.sets?.length || 0) + 1
    };

    const result = await api.saveSet(newSet);
    
    // Обновляем локальное состояние для мгновенного отображения
    const updatedWorkout = {
      ...activeWorkout,
      sets: [...(activeWorkout?.sets || []), { ...newSet, offline: result.offline }]
    };
    setActiveWorkout(updatedWorkout);
    localStorage.setItem(WORKOUT_STORAGE_KEY, JSON.stringify(updatedWorkout));
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      <ScreenHeader 
        title="Моя Тренировка" 
        subtitle={isSyncing ? "Синхронизация..." : "Данные в безопасности"} 
      />
      
      <main className="p-4 max-w-lg mx-auto">
        <div className="bg-white rounded-2xl shadow-sm p-6 mb-6">
          <h3 className="text-lg font-bold mb-4">Выбор упражнения</h3>
          {/* Здесь ваш список упражнений из EXERCISES */}
          <div className="grid grid-cols-1 gap-3">
            {Object.entries(EXERCISES).slice(0, 5).map(([id, ex]) => (
              <button 
                key={id}
                onClick={() => handleAddSet(id, 80, 10)} // Пример фиксации
                className="flex justify-between items-center p-4 border rounded-xl hover:bg-blue-50 transition"
              >
                <span className="font-medium">{ex.name}</span>
                <span className="text-blue-500">+</span>
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-4">
          <h3 className="text-lg font-bold">Последние подходы</h3>
          {activeWorkout?.sets?.map((set: any, idx: number) => (
            <SetDisplayRow key={idx} set={set} />
          ))}
        </div>
      </main>
    </div>
  );
}