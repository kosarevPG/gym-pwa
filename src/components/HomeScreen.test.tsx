import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { HomeScreen } from './HomeScreen';

vi.mock('../lib/api', () => ({
  fetchAllExercises: vi.fn().mockResolvedValue([]),
  fetchTrainingLogsWindow: vi.fn().mockResolvedValue([]),
}));

describe('HomeScreen', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows loading then content after data load', async () => {
    render(<HomeScreen onOpenExercises={() => {}} onOpenAnalytics={() => {}} />);
    expect(screen.getByText('Загрузка...')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.queryByText('Загрузка...')).not.toBeInTheDocument();
    });
    expect(screen.getByText(/Attendance/i)).toBeInTheDocument();
    expect(screen.getByText(/Gym Dashboard/i)).toBeInTheDocument();
  });

  it('renders Тренировка and Аналитика buttons', async () => {
    render(<HomeScreen onOpenExercises={() => {}} onOpenAnalytics={() => {}} />);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Тренировка/i })).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: /Аналитика/i })).toBeInTheDocument();
  });
});
