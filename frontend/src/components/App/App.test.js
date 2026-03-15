import axios from 'axios';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import App from './App';

beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear();
  jest.clearAllMocks();
  axios.get.mockImplementation((url) => {
    if (url === '/api/auth/me') {
      return Promise.resolve({
        data: {
          user: {
            id: 1,
            email: 'operator@example.com',
            displayName: 'Operator User',
            role: 'operator',
          },
        },
      });
    }

    if (url === '/api/presets') {
      return Promise.resolve({ data: { presets: [] } });
    }

    return Promise.resolve({ data: {} });
  });
});

test('renders the home page and primary navigation', () => {
  render(
    <MemoryRouter initialEntries={['/']}>
      <App />
    </MemoryRouter>
  );

  expect(
    screen.getByRole('heading', { name: /skinnerbox trial control/i })
  ).toBeInTheDocument();
  expect(screen.getByText(/run authenticated behavioral experiments from one place/i)).toBeInTheDocument();
  expect(screen.getAllByRole('link', { name: /log in/i }).length).toBeGreaterThan(0);
  expect(screen.getByRole('link', { name: /register/i })).toBeInTheDocument();
  expect(screen.getAllByRole('link', { name: /about us/i }).length).toBeGreaterThan(0);
});

test('renders the hawk works about page', () => {
  render(
    <MemoryRouter initialEntries={['/About']}>
      <App />
    </MemoryRouter>
  );

  expect(screen.getByRole('heading', { name: /about us/i })).toBeInTheDocument();
  expect(screen.getByRole('link', { name: /hawk works at viterbo university/i })).toHaveAttribute(
    'href',
    'https://www.viterbo.edu/engineering/hawk-works'
  );
});

test('renders the trial setup for an authenticated operator', async () => {
  sessionStorage.setItem('skinnerbox.authToken', 'test-token');
  sessionStorage.setItem(
    'skinnerbox.authUser',
    JSON.stringify({
      id: 1,
      email: 'operator@example.com',
      displayName: 'Operator User',
      role: 'operator',
    })
  );

  render(
    <MemoryRouter initialEntries={['/Trial']}>
      <App />
    </MemoryRouter>
  );

  expect(await screen.findByRole('heading', { name: /save current settings as preset/i })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /run test/i })).toBeInTheDocument();
  expect(screen.getByText(/the backend owns the timing, counts, rewards/i)).toBeInTheDocument();
});

test('renders the real-time pump prime controls on the I/O testing page', async () => {
  sessionStorage.setItem('skinnerbox.authToken', 'test-token');
  sessionStorage.setItem(
    'skinnerbox.authUser',
    JSON.stringify({
      id: 1,
      email: 'operator@example.com',
      displayName: 'Operator User',
      role: 'operator',
    })
  );

  render(
    <MemoryRouter initialEntries={['/IoTesting']}>
      <App />
    </MemoryRouter>
  );

  expect(await screen.findByRole('heading', { name: /i\/o testing/i })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /play buzzer test/i })).toBeInTheDocument();
  expect(screen.getByText(/confirm the passive buzzer can be heard/i)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /prime now/i })).toBeInTheDocument();
  expect(screen.getByText(/does not start, queue, or change a test/i)).toBeInTheDocument();
});
