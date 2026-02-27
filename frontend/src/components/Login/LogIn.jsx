// React core and hooks for state management
import React, { useState } from 'react';
// HTTP client for making API requests to backend
import axios from 'axios';
// React Router hook for programmatic navigation after login/register
import { useNavigate } from 'react-router-dom';


// Importing the Necessary Mui Libraries 
import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';
import FormHelperText from '@mui/material/FormHelperText';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import { FormControl, InputLabel, Input} from '@mui/material';

// Import custom CSS for styling the login page
import '../Login/Login.css';
// Import Viterbo University logo image
import VuLogo from '../../assets/RGB_Vertical_Viterbo_Logo.png';


// TODO: Finish Building the UI for the Login Page
const Login = () => {
  // State for storing the user's password input
  const [password, setPassword] = useState('');
  // State for storing the user's email input
  const [email, setEmail] = useState('');
  // State to toggle between login mode (false) and register mode (true)
  const [isRegister, setIsRegister] = useState(false);
  // State for storing and displaying error messages from failed authentication
  const [error, setError] = useState(''); 
  // Hook for programmatic navigation to different routes
  const navigate = useNavigate();

  /**
   * Handles form submission for both login and registration
   * @param {Event} e - Form submission event
   */
  const handleSubmit = async (e) => {
    // Prevent default form submission behavior (page reload)
    e.preventDefault();
    // Determine which endpoint to use based on current mode
    const endpoint = isRegister ? '/register' : '/login';
    // Construct full API URL pointing to backend server
    const url = `http://localhost:5001${endpoint}`;

    try {
      // Make POST request to backend with email and password
      // withCredentials: true enables cookie-based session management
      const response = await axios.post(url, { email, password }, { withCredentials: true });

      // Check if backend returned a success message
      if (response.data.message) {
        // Display success message to user
        alert(response.data.message);
        if (!isRegister) {
          // If logging in, redirect to Home page
          navigate('/Home');
        } else {
          // If registering, switch back to login mode so user can log in
          setIsRegister(false);
        }
      }
    } catch (error) {
      // Capture and display error message from backend, or generic message if none provided
      setError(error.response?.data?.error || 'Something went wrong');
    }
  };

  const handleRegistration = () => {
    navigate('/Register');
  }

  return (
    <div className="trial-settings">
      <div id = "loginFormContainer">

        <form onSubmit={handleSubmit}>
          <h1>Login</h1>

          <div className="input-group">
            <FormControl  fullWidth>
              <InputLabel htmlFor="loginEmail">Email:</InputLabel>
              <Input
                id="txtEmail"
                placeholder="Enter Email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </FormControl>
          </div>

          <div className="input-group">
            <FormControl  fullWidth>
              <InputLabel htmlFor="loginPassword">Password:</InputLabel>
              <Input
                id="txtPassword"
                placeholder="Enter Password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </FormControl>
          </div>

          <div>
            {/* <button type="submit">{isRegister ? 'Register' : 'Login'}</button> */}
            <Button type = "submit" id = "btnLogin" variant="contained" size="large">Login</Button>
            <link rel="stylesheet" href="../" />
            <Button id = "btnRegister" onClick={handleRegistration} variant="contained" size="large">Register</Button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default Login;
