import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { GameOverScreen, type GameOverLabels } from './GameOverScreen';

const labels: GameOverLabels = {
  title: 'Game Over',
  scoreLabel: 'Score',
  timeLabel: 'Time',
  newBest: 'New best!',
  leaderboardTitle: 'Leaderboard',
  back: 'Back to results',
  anonymous: 'Anonymous',
  loading: 'Loading...',
  error: 'Could not reach the leaderboard.',
  empty: 'No scores yet.',
  playAgain: 'Play again',
  yourEntry: 'Your entry',
};

function renderScreen(overrides: Partial<React.ComponentProps<typeof GameOverScreen>> = {}) {
  return render(
    <GameOverScreen
      labels={labels}
      score={1234}
      elapsedMs={65_000}
      status="idle"
      entries={null}
      selfRank={null}
      onPlayAgain={vi.fn()}
      {...overrides}
    />,
  );
}

function openLeaderboard() {
  fireEvent.click(screen.getByText(labels.leaderboardTitle));
}

describe('GameOverScreen results stage', () => {
  it('shows the score and formatted elapsed time', () => {
    renderScreen();
    expect(screen.getByText('1,234')).toBeInTheDocument();
    expect(screen.getByText(/1:05/)).toBeInTheDocument();
  });

  it('does not show a new-best badge by default', () => {
    renderScreen();
    expect(screen.queryByText(labels.newBest)).not.toBeInTheDocument();
  });

  it('shows a new-best badge when isNewBest is true', () => {
    renderScreen({ isNewBest: true });
    expect(screen.getByText(labels.newBest)).toBeInTheDocument();
  });

  it('shows the difficulty chip when provided', () => {
    renderScreen({ difficultyLabel: 'Medium' });
    expect(screen.getByText('Medium')).toBeInTheDocument();
  });

  it('omits the difficulty chip when not provided', () => {
    renderScreen();
    expect(screen.queryByText('Medium')).not.toBeInTheDocument();
  });

  it('calls onPlayAgain when Play again is pressed', () => {
    const onPlayAgain = vi.fn();
    renderScreen({ onPlayAgain });
    fireEvent.click(screen.getByText(labels.playAgain));
    expect(onPlayAgain).toHaveBeenCalledTimes(1);
  });

  it('does not render leaderboard content until the leaderboard button is pressed', () => {
    renderScreen({ status: 'error' });
    expect(screen.queryByText(labels.error)).not.toBeInTheDocument();
  });
});

describe('GameOverScreen leaderboard stage', () => {
  it('opens from the secondary button and returns to results via the back control', () => {
    renderScreen();
    openLeaderboard();
    // Results content (the hero score) is gone while on the leaderboard stage.
    expect(screen.queryByText('1,234')).not.toBeInTheDocument();
    expect(screen.getByText(labels.back)).toBeInTheDocument();

    fireEvent.click(screen.getByText(labels.back));
    expect(screen.getByText('1,234')).toBeInTheDocument();
  });

  it('shows skeleton rows while loading, not a blank void', () => {
    renderScreen({ status: 'submitting' });
    openLeaderboard();
    expect(screen.getByRole('status', { name: labels.loading })).toBeInTheDocument();
  });

  it('shows a non-blocking error message', () => {
    renderScreen({ status: 'error' });
    openLeaderboard();
    expect(screen.getByText(labels.error)).toBeInTheDocument();
  });

  it('shows the empty-board message', () => {
    renderScreen({ status: 'done', entries: [] });
    openLeaderboard();
    expect(screen.getByText(labels.empty)).toBeInTheDocument();
  });

  it('renders anonymous entries muted and marks the self row by rank, not name', () => {
    renderScreen({
      status: 'done',
      selfRank: 2,
      entries: [
        { rank: 1, username: 'nova', score: 100 },
        { rank: 2, username: null, score: 50 },
      ],
    });
    openLeaderboard();
    expect(screen.getByText('Anonymous')).toBeInTheDocument();
    expect(screen.getByText(labels.yourEntry)).toBeInTheDocument();
    const ownRow = screen.getByText(labels.yourEntry).closest('li');
    expect(ownRow).toHaveTextContent('Anonymous');
    expect(ownRow).not.toHaveTextContent('nova');
  });

  it('gives the top three ranks a medal treatment', () => {
    renderScreen({
      status: 'done',
      selfRank: null,
      entries: [
        { rank: 1, username: 'nova', score: 100 },
        { rank: 2, username: 'atlas', score: 90 },
        { rank: 3, username: 'orion', score: 80 },
        { rank: 4, username: 'vega', score: 70 },
      ],
    });
    openLeaderboard();
    const rows = document.querySelectorAll('li[data-rank]');
    expect(rows).toHaveLength(3);
  });
});
