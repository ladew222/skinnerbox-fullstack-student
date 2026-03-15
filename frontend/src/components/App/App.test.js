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
    screen.getByRole('heading', { name: /welcome to the skinner box user application/i })
  ).toBeInTheDocument();
  expect(screen.getAllByRole('link', { name: /log in/i }).length).toBeGreaterThan(0);
  expect(screen.getByRole('link', { name: /register/i })).toBeInTheDocument();
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
  expect(screen.getByText(/one fixed stimulus light/i)).toBeInTheDocument();
});
