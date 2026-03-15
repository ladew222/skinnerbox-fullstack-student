import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import App from './App';

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
