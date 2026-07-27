import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { GameOverScreen, type GameOverLabels } from './GameOverScreen';

const labels: GameOverLabels = {
  title: 'Game Over',
  scoreLabel: 'Score',
  timeLabel: 'Time',
  leaderboardTitle: 'Leaderboard',
  anonymous: 'Anonymous',
  loading: 'Loading...',
  error: 'Could not reach the leaderboard.',
  empty: 'No scores yet.',
  playAgain: 'Play again',
  yourEntry: 'Your entry',
};

describe('GameOverScreen', () => {
  it('shows the score and formatted elapsed time', () => {
    render(
      <GameOverScreen
        labels={labels}
        score={1234}
        elapsedMs={65_000}
        status="idle"
        entries={null}
        selfRank={null}
        onPlayAgain={vi.fn()}
      />,
    );
    expect(screen.getByText('1,234')).toBeInTheDocument();
    expect(screen.getByText(/1:05/)).toBeInTheDocument();
  });

  it('shows a loading state while submitting', () => {
    render(
      <GameOverScreen
        labels={labels}
        score={10}
        elapsedMs={1000}
        status="submitting"
        entries={null}
        selfRank={null}
        onPlayAgain={vi.fn()}
      />,
    );
    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('shows a non-blocking error line without hiding the score', () => {
    render(
      <GameOverScreen
        labels={labels}
        score={10}
        elapsedMs={1000}
        status="error"
        entries={null}
        selfRank={null}
        onPlayAgain={vi.fn()}
      />,
    );
    expect(screen.getByText(labels.error)).toBeInTheDocument();
    expect(screen.getByText('10')).toBeInTheDocument();
  });

  it('renders anonymous entries and marks the self row by rank, not name', () => {
    render(
      <GameOverScreen
        labels={labels}
        score={50}
        elapsedMs={1000}
        status="done"
        entries={[
          { rank: 1, username: 'nova', score: 100 },
          { rank: 2, username: null, score: 50 },
        ]}
        selfRank={2}
        onPlayAgain={vi.fn()}
      />,
    );
    expect(screen.getByText('Anonymous')).toBeInTheDocument();
    expect(screen.getByText('Your entry')).toBeInTheDocument();
    const ownRow = screen.getByText('Your entry').closest('li');
    expect(ownRow).toHaveTextContent('Anonymous');
    expect(ownRow).not.toHaveTextContent('nova');
  });

  it('shows the empty board message', () => {
    render(
      <GameOverScreen
        labels={labels}
        score={0}
        elapsedMs={0}
        status="done"
        entries={[]}
        selfRank={null}
        onPlayAgain={vi.fn()}
      />,
    );
    expect(screen.getByText(labels.empty)).toBeInTheDocument();
  });

  it('calls onPlayAgain when the button is pressed', () => {
    const onPlayAgain = vi.fn();
    render(
      <GameOverScreen
        labels={labels}
        score={0}
        elapsedMs={0}
        status="idle"
        entries={null}
        selfRank={null}
        onPlayAgain={onPlayAgain}
      />,
    );
    fireEvent.click(screen.getByText('Play again'));
    expect(onPlayAgain).toHaveBeenCalledTimes(1);
  });
});
