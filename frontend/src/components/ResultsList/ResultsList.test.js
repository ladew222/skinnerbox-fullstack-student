import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import ResultsList from './ResultsList';
import { deleteResult, deleteResults, getResults } from '../../utilities/api';
import { useAuth } from '../../context/AuthContext';


jest.mock('../../utilities/api', () => ({
  deleteResult: jest.fn(),
  deleteResults: jest.fn(),
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

    expect(await screen.findByLabelText(/select shaping trial/i)).toBeInTheDocument();
    expect(screen.getAllByText('Shaping Trial').length).toBeGreaterThan(0);
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

    expect(await screen.findByLabelText(/select admin trial/i)).toBeInTheDocument();

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

    expect(await screen.findByLabelText(/select trial one/i)).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText(/select trial one/i));
    fireEvent.click(screen.getByLabelText(/select trial two/i));
    fireEvent.click(screen.getByRole('button', { name: /download selected csv \(2\)/i }));

    expect(window.URL.createObjectURL).toHaveBeenCalledTimes(1);
    expect(clickSpy).toHaveBeenCalledTimes(1);
  });

  test('shows preliminary summary charts for the current visible results', async () => {
    useAuth.mockReturnValue({ isAdmin: false });
    getResults.mockResolvedValue([
      {
        id: 'trial-1',
        name: 'Trial One',
        updatedAt: '2026-03-15T12:34:00Z',
        createdAt: '2026-03-15T12:00:00Z',
        complete: true,
        leverPressCount: 8,
        nosePokeCount: 2,
        totalPresses: 10,
        rewardCount: 4,
        stimulusType: 'Light',
        stimulusDescription: 'Light',
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
        complete: false,
        leverPressCount: 3,
        nosePokeCount: 5,
        totalPresses: 8,
        rewardCount: 2,
        stimulusType: 'Tone',
        stimulusDescription: 'Tone',
        conductedBy: {
          id: 8,
          email: 'assistant@example.com',
          displayName: 'Assistant User',
        },
      },
    ]);

    render(<ResultsList />);

    expect(await screen.findByLabelText(/select trial one/i)).toBeInTheDocument();
    expect(await screen.findByLabelText(/results snapshot/i)).toBeInTheDocument();
    expect(screen.getByText(/showing 2 visible trials/i)).toBeInTheDocument();
    expect(screen.getByText(/completion overview/i)).toBeInTheDocument();
    expect(screen.getByText(/average response profile/i)).toBeInTheDocument();
    expect(screen.getByText(/interactions by trial/i)).toBeInTheDocument();
    expect(screen.getByText(/stimulus mix/i)).toBeInTheDocument();
  });

  test('shows saved notes and allows timeline download for a selected result', async () => {
    useAuth.mockReturnValue({ isAdmin: false });
    getResults.mockResolvedValue([
      {
        id: 'trial-1',
        name: 'Timeline Trial',
        updatedAt: '2026-03-15T12:34:00Z',
        createdAt: '2026-03-15T12:00:00Z',
        conductedBy: {
          id: 7,
          email: 'operator@example.com',
          displayName: 'Operator User',
        },
        notes: [
          {
            id: 11,
            type: 'note',
            label: 'Operator note',
            detailText: 'Animal paused near the lever.',
            elapsedSeconds: 14,
          },
        ],
        eventTimeline: [
          {
            id: 1,
            type: 'configured',
            label: 'Test configured',
            detailText: 'Timeline Trial prepared.',
            elapsedSeconds: 0,
          },
          {
            id: 11,
            type: 'note',
            label: 'Operator note',
            detailText: 'Animal paused near the lever.',
            elapsedSeconds: 14,
          },
        ],
      },
    ]);

    render(<ResultsList />);

    const timelineCheckbox = await screen.findByLabelText(/select timeline trial/i);
    fireEvent.click(timelineCheckbox.closest('li'));

    expect(screen.getByText(/operator notes/i)).toBeInTheDocument();
    expect(screen.getAllByText(/animal paused near the lever/i).length).toBeGreaterThanOrEqual(2);

    fireEvent.click(screen.getByRole('button', { name: /show timeline trends/i }));

    expect(screen.getByRole('heading', { name: /timeline trends/i })).toBeInTheDocument();
    expect(screen.getByTestId('mui-line-chart')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /download timeline/i }));

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
    deleteResults.mockResolvedValue({
      message: 'Deleted 2 saved trials.',
      deletedIds: ['trial-1', 'trial-2'],
      missingIds: [],
      deletedCount: 2,
    });

    render(<ResultsList />);

    expect(await screen.findByLabelText(/select trial one/i)).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText(/select trial one/i));
    fireEvent.click(screen.getByLabelText(/select trial two/i));
    fireEvent.click(screen.getByRole('button', { name: /delete selected \(2\)/i }));

    await waitFor(() => {
      expect(deleteResults).toHaveBeenCalledWith(['trial-1', 'trial-2']);
    });

    await waitFor(() => {
      expect(screen.queryByLabelText(/select trial one/i)).not.toBeInTheDocument();
      expect(screen.queryByLabelText(/select trial two/i)).not.toBeInTheDocument();
    });

    expect(screen.getByText(/deleted 2 saved trials/i)).toBeInTheDocument();
  });
});
