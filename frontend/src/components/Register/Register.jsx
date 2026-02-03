import React, { useState } from 'react';


import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';
import FormHelperText from '@mui/material/FormHelperText';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import { FormControl, InputLabel, Input} from '@mui/material';


// TODO: Finish Building the UI for the Register Page
const Register = () => {
    const [form, setForm] = useState({
        email: '',
        password: '',
    });

    const [message, setMessage] = useState('');

    const handleChange = (e) => {
        setForm({
            ...form,
            [e.target.name]: e.target.value,
        });
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        // Here you would typically send form data to your backend API
        setMessage('Registration successful!');
    };

   /*return (
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
                    { <button type="submit">{isRegister ? 'Register' : 'Login'}</button> }
                    <Button type = "submit" id = "btnLogin" variant="contained" size="large">Login</Button>
                    <link rel="stylesheet" href="../" />
                    <Button id = "btnRegister" onClick={handleRegistration} variant="contained" size="large">Register</Button>
                </div>
                </form>
            </div>
        </div>
    ); */
};

export default Register;