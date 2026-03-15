import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import ResultsList from './ResultsList';
import { deleteResult, getResults } from '../../utilities/api';
import { useAuth } from '../../context/AuthContext';


jest.mock('../../utilities/api', () => ({
  deleteResult: jest.fn(),
  getResults: jest.fn(),
}));

jest.mock('../../context/AuthContext', () => ({
  useAuth: jest.fn(),
}));


describe('ResultsList', () => {
  const originalCreateObjectURL = window.URL.createObjectURL;
  const originalRevokeObjectURL = window.URL.revokeObjectURL;
  let anchorClickSpy;
  let clickSpy;

  beforeEach(() => {
    jest.clearAllMocks();
    window.confirm = jest.fn(() => true);
    window.URL.createObjectURL = jest.fn(() => 'blob:results');
    window.URL.revokeObjectURL = jest.fn();
    clickSpy = jest.fn();
    anchorClickSpy = jest
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(clickSpy);
  });

  afterEach(() => {
    window.URL.createObjectURL = originalCreateObjectURL;
    window.URL.revokeObjectURL = originalRevokeObjectURL;
    anchorClickSpy.mockRestore();
  });

  test('shows the saved trial date in the available trials list', async () => {
    useAuth.mockReturnValue({ isAdmin: false });
    getResults.mockResolvedValue([
      {
        id: 'trial-1',
        name: 'Shaping Trial',
        updatedAt: '2026-03-15T12:34:00Z',
        createdAt: '2026-03-15T12:00:00Z',
        conductedBy: {
          id: 7,
          email: 'operator@example.com',
          displayName: 'Operator User',
        },
      },
    ]);

    render(<ResultsList />);

    expect(await screen.findByText('Shaping Trial')).toBeInTheDocument();
    expect(screen.getByText(/2026/i)).toBeInTheDocument();
    expect(screen.getByText(/operator user/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /delete/i })).not.toBeInTheDocument();
  });

  test('lets an admin delete a saved trial from the list', async () => {
    useAuth.mockReturnValue({ isAdmin: true });
    getResults.mockResolvedValue([
      {
        id: 'trial-1',
        name: 'Admin Trial',
        updatedAt: '2026-03-15T12:34:00Z',
        createdAt: '2026-03-15T12:00:00Z',
        conductedBy: {
          id: 7,
          email: 'operator@example.com',
          displayName: 'Operator User',
        },
      },
    ]);
    deleteResult.mockResolvedValue({ message: 'Saved trial deleted successfully.' });

    render(<ResultsList />);

    expect(await screen.findByText('Admin Trial')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /^delete$/i }));

    await waitFor(() => {
      expect(deleteResult).toHaveBeenCalledWith('trial-1');
    });
    await waitFor(() => {
      expect(screen.queryByText('Admin Trial')).not.toBeInTheDocument();
    });
    expect(screen.getByText(/deleted successfully/i)).toBeInTheDocument();
  });

  test('downloads multiple selected trials as one csv', async () => {
    useAuth.mockReturnValue({ isAdmin: false });
    getResults.mockResolvedValue([
      {
        id: 'trial-1',
        name: 'Trial One',
        updatedAt: '2026-03-15T12:34:00Z',
        createdAt: '2026-03-15T12:00:00Z',
        conductedBy: {
          id: 7,
          email: 'operator@example.com',
          displayName: 'Operator User',
        },
      },
      {
        id: 'trial-2',
        name: 'Trial Two',
        updatedAt: '2026-03-15T13:34:00Z',
        createdAt: '2026-03-15T13:00:00Z',
        conductedBy: {
          id: 8,
          email: 'assistant@example.com',
          displayName: 'Assistant User',
        },
      },
    ]);

    render(<ResultsList />);

    expect(await screen.findByText('Trial One')).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText(/select trial one/i));
    fireEvent.click(screen.getByLabelText(/select trial two/i));
    fireEvent.click(screen.getByRole('button', { name: /download selected csv \(2\)/i }));

    expect(window.URL.createObjectURL).toHaveBeenCalledTimes(1);
    expect(clickSpy).toHaveBeenCalledTimes(1);
  });

  test('lets an admin delete multiple selected trials at once', async () => {
    useAuth.mockReturnValue({ isAdmin: true });
    getResults.mockResolvedValue([
      {
        id: 'trial-1',
        name: 'Trial One',
        updatedAt: '2026-03-15T12:34:00Z',
        createdAt: '2026-03-15T12:00:00Z',
        conductedBy: {
          id: 7,
          email: 'operator@example.com',
          displayName: 'Operator User',
        },
      },
      {
        id: 'trial-2',
        name: 'Trial Two',
        updatedAt: '2026-03-15T13:34:00Z',
        createdAt: '2026-03-15T13:00:00Z',
        conductedBy: {
          id: 8,
          email: 'assistant@example.com',
          displayName: 'Assistant User',
        },
      },
    ]);
    deleteResult.mockResolvedValue({ message: 'Saved trial deleted successfully.' });

    render(<ResultsList />);

    expect(await screen.findByText('Trial One')).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText(/select trial one/i));
    fireEvent.click(screen.getByLabelText(/select trial two/i));
    fireEvent.click(screen.getByRole('button', { name: /delete selected \(2\)/i }));

    await waitFor(() => {
      expect(deleteResult).toHaveBeenCalledWith('trial-1');
      expect(deleteResult).toHaveBeenCalledWith('trial-2');
    });

    await waitFor(() => {
      expect(screen.queryByText('Trial One')).not.toBeInTheDocument();
      expect(screen.queryByText('Trial Two')).not.toBeInTheDocument();
    });

    expect(screen.getByText(/2 saved trials deleted successfully/i)).toBeInTheDocument();
  });
});
