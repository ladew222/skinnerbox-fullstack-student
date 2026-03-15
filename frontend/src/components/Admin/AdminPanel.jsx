import React, { useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  Input,
  InputLabel,
  Stack,
  Typography,
} from '@mui/material';

import { getAdminUsers, resetAdminUserPassword, updateAdminUserStatus } from '../../utilities/api';


const AdminPanel = () => {
  // Stored account list used by the admin to approve or disable network access.
  const [users, setUsers] = useState([]);
  // Loading state used while the page fetches the current registration queue.
  const [isLoading, setIsLoading] = useState(true);
  // Friendly UI message surfaced when admin actions succeed or fail.
  const [feedback, setFeedback] = useState(null);
  // Dialog state for admin-triggered password resets.
  const [resetDialogUser, setResetDialogUser] = useState(null);
  const [resetPassword, setResetPassword] = useState('');
  const [isResettingPassword, setIsResettingPassword] = useState(false);

  const loadUsers = async () => {
    setIsLoading(true);
    try {
      const response = await getAdminUsers();
      setUsers(response.users);
      setFeedback(null);
    } catch (error) {
      setFeedback({
        severity: 'error',
        message: error.message,
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadUsers();
  }, []);

  const handleStatusChange = async (userId, status) => {
    try {
      const response = await updateAdminUserStatus(userId, status);
      setUsers((currentUsers) =>
        currentUsers.map((user) => (user.id === userId ? response.user : user))
      );
      setFeedback({
        severity: 'success',
        message: response.message,
      });
    } catch (error) {
      setFeedback({
        severity: 'error',
        message: error.message,
      });
    }
  };

  const openResetDialog = (user) => {
    setResetDialogUser(user);
    setResetPassword('');
    setFeedback(null);
  };

  const closeResetDialog = () => {
    if (isResettingPassword) {
      return;
    }

    setResetDialogUser(null);
    setResetPassword('');
  };

  const handlePasswordReset = async () => {
    if (!resetDialogUser) {
      return;
    }

    try {
      setIsResettingPassword(true);
      const response = await resetAdminUserPassword(resetDialogUser.id, resetPassword);
      setUsers((currentUsers) =>
        currentUsers.map((user) => (user.id === resetDialogUser.id ? response.user : user))
      );
      setFeedback({
        severity: 'success',
        message: response.message,
      });
      setResetDialogUser(null);
      setResetPassword('');
    } catch (error) {
      setFeedback({
        severity: 'error',
        message: error.message,
      });
    } finally {
      setIsResettingPassword(false);
    }
  };

  const pendingUsers = users.filter((user) => user.status === 'pending');
  const managedUsers = users.filter((user) => user.status !== 'pending');

  return (
    <Box sx={{ maxWidth: 960, margin: '0 auto', padding: 3 }}>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} justifyContent="space-between" sx={{ mb: 3 }}>
        <Box>
          <Typography variant="h4" component="h1" gutterBottom>
            Access Administration
          </Typography>
          <Typography variant="body1" color="text.secondary">
            Review new registrations and control who can reach the test and results pages.
          </Typography>
        </Box>
        <Button variant="outlined" onClick={loadUsers}>
          Refresh
        </Button>
      </Stack>

      {feedback && (
        <Alert severity={feedback.severity} sx={{ mb: 3 }}>
          {feedback.message}
        </Alert>
      )}

      {isLoading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
          <CircularProgress />
        </Box>
      ) : (
        <Stack spacing={3}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Pending Registrations
              </Typography>
              {pendingUsers.length === 0 ? (
                <Typography color="text.secondary">
                  No pending registrations right now.
                </Typography>
              ) : (
                <Stack spacing={2}>
                  {pendingUsers.map((user) => (
                    <Card key={user.id} variant="outlined">
                      <CardContent>
                        <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} justifyContent="space-between">
                          <Box>
                            <Typography variant="subtitle1">{user.displayName}</Typography>
                            <Typography variant="body2" color="text.secondary">
                              {user.email}
                            </Typography>
                            <Typography variant="body2" color="text.secondary">
                              Requested: {user.createdAt || 'Unknown'}
                            </Typography>
                          </Box>
                          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                            <Button
                              variant="contained"
                              onClick={() => handleStatusChange(user.id, 'approved')}
                            >
                              Approve
                            </Button>
                            <Button
                              variant="outlined"
                              onClick={() => openResetDialog(user)}
                            >
                              Reset Password
                            </Button>
                            <Button
                              variant="outlined"
                              color="warning"
                              onClick={() => handleStatusChange(user.id, 'disabled')}
                            >
                              Disable
                            </Button>
                          </Stack>
                        </Stack>
                      </CardContent>
                    </Card>
                  ))}
                </Stack>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Existing Accounts
              </Typography>
              <Stack spacing={2}>
                {managedUsers.map((user) => (
                  <Card key={user.id} variant="outlined">
                    <CardContent>
                      <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} justifyContent="space-between">
                        <Box>
                          <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
                            <Typography variant="subtitle1">{user.displayName}</Typography>
                            <Chip
                              label={user.role}
                              size="small"
                              color={user.role === 'admin' ? 'secondary' : 'default'}
                            />
                            <Chip
                              label={user.status}
                              size="small"
                              color={user.status === 'approved' ? 'success' : 'default'}
                            />
                          </Stack>
                          <Typography variant="body2" color="text.secondary">
                            {user.email}
                          </Typography>
                          <Typography variant="body2" color="text.secondary">
                            Approved by: {user.approvedByEmail || 'Local admin reset'}
                          </Typography>
                          <Typography variant="body2" color="text.secondary">
                            Last login: {user.lastLoginAt || 'Never'}
                          </Typography>
                        </Box>
                        {user.role !== 'admin' && (
                          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                            <Button
                              variant="outlined"
                              onClick={() => openResetDialog(user)}
                            >
                              Reset Password
                            </Button>
                            <Button
                              variant={user.status === 'approved' ? 'outlined' : 'contained'}
                              color={user.status === 'approved' ? 'warning' : 'primary'}
                              onClick={() =>
                                handleStatusChange(
                                  user.id,
                                  user.status === 'approved' ? 'disabled' : 'approved'
                                )
                              }
                            >
                              {user.status === 'approved' ? 'Disable Access' : 'Approve Access'}
                            </Button>
                          </Stack>
                        )}
                      </Stack>
                    </CardContent>
                  </Card>
                ))}
              </Stack>
            </CardContent>
          </Card>
        </Stack>
      )}
      <Dialog open={Boolean(resetDialogUser)} onClose={closeResetDialog} fullWidth maxWidth="xs">
        <DialogTitle>Reset User Password</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <Typography variant="body2" color="text.secondary">
              Set a new password for {resetDialogUser?.displayName || 'this user'}. Existing sessions will be signed out.
            </Typography>
            <FormControl fullWidth>
              <InputLabel htmlFor="resetPassword">New Password</InputLabel>
              <Input
                id="resetPassword"
                type="password"
                value={resetPassword}
                onChange={(event) => setResetPassword(event.target.value)}
              />
            </FormControl>
            <Typography variant="caption" color="text.secondary">
              Passwords must be at least 8 characters long.
            </Typography>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={closeResetDialog} disabled={isResettingPassword}>
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={handlePasswordReset}
            disabled={isResettingPassword || resetPassword.length < 8}
          >
            {isResettingPassword ? 'Resetting...' : 'Reset Password'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};


export default AdminPanel;
