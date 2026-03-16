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

    if (url === '/api/counts') {
      return Promise.resolve({ data: { lever_press_count: 0, nose_poke_count: 0 } });
    }

    if (url === '/api/maintenance/status') {
      return Promise.resolve({
        data: {
          gpioMode: 'mock',
          oledMode: 'mock',
          programOk: true,
          runningIndicatorOn: false,
          errorIndicatorBlinking: false,
          lightOn: false,
          rewardPulseSeconds: 0.03,
          defaultRewardPulseMilliseconds: 30,
          activeRewardPulseMilliseconds: 30,
          latestRewardPulse: null,
          estimatedRewardVolumeMl: null,
          defaultLeverDebounceMilliseconds: 150,
          activeLeverDebounceMilliseconds: 150,
          latestLeverDebounce: null,
          defaultRequireLeverReleaseBeforeCount: false,
          activeRequireLeverReleaseBeforeCount: false,
          latestLeverReleaseRequirement: null,
          latestPumpCalibration: null,
        },
      });
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

test('renders the real-time pump prime controls on the I/O config page', async () => {
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

  expect(await screen.findByRole('heading', { name: /i\/o config/i })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /play buzzer test/i })).toBeInTheDocument();
  expect(screen.getByText(/confirm the passive buzzer can be heard/i)).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: /manual run pump/i })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /run pump test/i })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /save pump calibration/i })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /reset lever baseline/i })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /reset nose poke baseline/i })).toBeInTheDocument();
  expect(screen.getByText(/they only reset the “since baseline” counters/i)).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: /maintenance status/i })).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: /current default values/i })).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: /pump calibration/i })).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: /lever input settings/i })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /save lever count mode/i })).toBeInTheDocument();
});
