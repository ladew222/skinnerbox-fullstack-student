import React, { useState } from 'react';
import { Alert, Button, FormControl, Input, InputLabel, Stack, Typography } from '@mui/material';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';

import { useAuth } from '../../context/AuthContext';
import './Login.css';


const Login = () => {
  // Local form state for the login request payload.
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  // UI state used to show auth-specific success and error messages from the backend.
  const [errorMessage, setErrorMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { isAuthenticated, login } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const redirectTarget = location.state?.from?.pathname || '/Trial';
  const registrationSubmitted = location.state?.registrationSubmitted;

  if (isAuthenticated) {
    return <Navigate replace to={redirectTarget} />;
  }

  const handleSubmit = async (event) => {
    event.preventDefault();
    setIsSubmitting(true);
    setErrorMessage('');

    try {
      const response = await login({ email, password });
      navigate(response.user.role === 'admin' ? '/Admin' : redirectTarget, { replace: true });
    } catch (error) {
      setErrorMessage(error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="trial-settings">
      <form onSubmit={handleSubmit}>
        <Stack spacing={3}>
          <div>
            <Typography variant="h4" component="h1" gutterBottom>
              Sign In
            </Typography>
            <Typography variant="body1" color="text.secondary">
              Sign in to run tests, view results, and manage the SkinnerBox on your network.
            </Typography>
          </div>

          {registrationSubmitted && (
            <Alert severity="success">
              Registration submitted. A local administrator must approve your account before you can log in.
            </Alert>
          )}

          {errorMessage && <Alert severity="error">{errorMessage}</Alert>}

          <FormControl fullWidth>
            <InputLabel htmlFor="loginEmail">Email</InputLabel>
            <Input
              id="loginEmail"
              placeholder="Enter Email"
              required
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </FormControl>

          <FormControl fullWidth>
            <InputLabel htmlFor="loginPassword">Password</InputLabel>
            <Input
              id="loginPassword"
              placeholder="Enter Password"
              required
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </FormControl>

          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <Button type="submit" id="btnLogin" variant="contained" size="large" disabled={isSubmitting}>
              {isSubmitting ? 'Signing In...' : 'Sign In'}
            </Button>
            <Button component={Link} id="btnRegister" to="/Register" variant="outlined" size="large">
              Request Access
            </Button>
          </Stack>
        </Stack>
      </form>
    </div>
  );
};


export default Login;
