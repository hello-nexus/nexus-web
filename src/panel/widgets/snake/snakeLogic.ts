export type Direction = 'UP' | 'DOWN' | 'LEFT' | 'RIGHT';

export interface Point {
  x: number;
  y: number;
}

export interface SnakeState {
  snake: Point[];
  food: Point;
  direction: Direction;
  score: number;
  gameOver: boolean;
}

export const GRID_COLS = 14;
export const GRID_ROWS = 21;

export function createInitialState(randomFn: () => number = Math.random): SnakeState {
  const startX = Math.floor(GRID_COLS / 2);
  const startY = Math.floor(GRID_ROWS / 2);
  const snake: Point[] = [
    { x: startX, y: startY },
    { x: startX - 1, y: startY },
    { x: startX - 2, y: startY },
  ];
  const food = spawnFood(snake, randomFn);
  return { snake, food, direction: 'RIGHT', score: 0, gameOver: false };
}

export function isOpposite(a: Direction, b: Direction): boolean {
  return (
    (a === 'UP' && b === 'DOWN') ||
    (a === 'DOWN' && b === 'UP') ||
    (a === 'LEFT' && b === 'RIGHT') ||
    (a === 'RIGHT' && b === 'LEFT')
  );
}

export function getNextHead(head: Point, direction: Direction): Point {
  switch (direction) {
    case 'UP':
      return { x: head.x, y: (head.y - 1 + GRID_ROWS) % GRID_ROWS };
    case 'DOWN':
      return { x: head.x, y: (head.y + 1) % GRID_ROWS };
    case 'LEFT':
      return { x: (head.x - 1 + GRID_COLS) % GRID_COLS, y: head.y };
    case 'RIGHT':
      return { x: (head.x + 1) % GRID_COLS, y: head.y };
  }
}

export function checkCollision(head: Point, snake: Point[]): boolean {
  return snake.some((seg) => seg.x === head.x && seg.y === head.y);
}

export function spawnFood(snake: Point[], randomFn: () => number = Math.random): Point {
  const occupied = new Set(snake.map((p) => `${p.x},${p.y}`));
  const free: Point[] = [];
  for (let y = 0; y < GRID_ROWS; y++) {
    for (let x = 0; x < GRID_COLS; x++) {
      if (!occupied.has(`${x},${y}`)) {
        free.push({ x, y });
      }
    }
  }
  if (free.length === 0) return { x: 0, y: 0 };
  return free[Math.floor(randomFn() * free.length)];
}

export function tick(state: SnakeState, randomFn: () => number = Math.random): SnakeState {
  if (state.gameOver) return state;

  const nextHead = getNextHead(state.snake[0], state.direction);
  // Check collision against entire current snake (before removing tail)
  if (checkCollision(nextHead, state.snake)) {
    return { ...state, gameOver: true };
  }

  const ateFood = nextHead.x === state.food.x && nextHead.y === state.food.y;
  const newSnake = [nextHead, ...state.snake];

  if (!ateFood) {
    newSnake.pop();
  }

  const newFood = ateFood ? spawnFood(newSnake, randomFn) : state.food;
  const newScore = ateFood ? state.score + 1 : state.score;

  return {
    snake: newSnake,
    food: newFood,
    direction: state.direction,
    score: newScore,
    gameOver: false,
  };
}

export function changeDirection(state: SnakeState, newDirection: Direction): SnakeState {
  if (isOpposite(state.direction, newDirection)) return state;
  return { ...state, direction: newDirection };
}
