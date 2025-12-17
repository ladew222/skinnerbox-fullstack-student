# Getting Started with Create React App

This project was bootstrapped with [Create React App](https://github.com/facebook/create-react-app).

## Available Scripts

In the project directory, you can run:

### `npm start`

Runs the app in the development mode.\
Open [http://localhost:3000](http://localhost:3000) to view it in your browser.

The page will reload when you make changes.\
You may also see any lint errors in the console.

### `npm test`

Launches the test runner in the interactive watch mode.\
See the section about [running tests](https://facebook.github.io/create-react-app/docs/running-tests) for more information.

### `npm run build`

Builds the app for production to the `build` folder.\
It correctly bundles React in production mode and optimizes the build for the best performance.

The build is minified and the filenames include the hashes.\
Your app is ready to be deployed!

See the section about [deployment](https://facebook.github.io/create-react-app/docs/deployment) for more information.

### `npm run eject`

**Note: this is a one-way operation. Once you `eject`, you can't go back!**

If you aren't satisfied with the build tool and configuration choices, you can `eject` at any time. This command will remove the single build dependency from your project.

Instead, it will copy all the configuration files and the transitive dependencies (webpack, Babel, ESLint, etc) right into your project so you have full control over them. All of the commands except `eject` will still work, but they will point to the copied scripts so you can tweak them. At this point you're on your own.

You don't have to ever use `eject`. The curated feature set is suitable for small and middle deployments, and you shouldn't feel obligated to use this feature. However we understand that this tool wouldn't be useful if you couldn't customize it when you are ready for it.

## Learn More

You can learn more in the [Create React App documentation](https://facebook.github.io/create-react-app/docs/getting-started).

To learn React, check out the [React documentation](https://reactjs.org/).

### Code Splitting

This section has moved here: [https://facebook.github.io/create-react-app/docs/code-splitting](https://facebook.github.io/create-react-app/docs/code-splitting)

### Analyzing the Bundle Size

This section has moved here: [https://facebook.github.io/create-react-app/docs/analyzing-the-bundle-size](https://facebook.github.io/create-react-app/docs/analyzing-the-bundle-size)

### Making a Progressive Web App

This section has moved here: [https://facebook.github.io/create-react-app/docs/making-a-progressive-web-app](https://facebook.github.io/create-react-app/docs/making-a-progressive-web-app)

### Advanced Configuration

This section has moved here: [https://facebook.github.io/create-react-app/docs/advanced-configuration](https://facebook.github.io/create-react-app/docs/advanced-configuration)

### Deployment

This section has moved here: [https://facebook.github.io/create-react-app/docs/deployment](https://facebook.github.io/create-react-app/docs/deployment)

### `npm run build` fails to minify

This section has moved here: [https://facebook.github.io/create-react-app/docs/troubleshooting#npm-run-build-fails-to-minify](https://facebook.github.io/create-react-app/docs/troubleshooting#npm-run-build-fails-to-minify)


________________________________________________________________________________________
Front-End:
    Developed to run on our computers

Back-End:
    Developed to run on the pi.

Start Back-End First(Install Code on pi/Run on the pi):
    Open a terminal 
    Navigate to the skinnerBox4Users
    Navigate to the skinnerBox4Users(new)
    Navigate to server folder
    Run: python3 sbBackEnd.py

Start Front-End Second:
   Replace API_URL to match the Back-End IP once it is started. Its the bottom URL


1. Install Libraries:

    Create a virtual Environment that holds all the necessary libraries.

    openpyxl:
        pip install openpyxl
    
    flask:
        pip install flask

    gpiozero:
        pip install gpiozero

    rpi-ws281x:
        Required:
            For the rpi_ws281x library you have to install "Microsoft C++ Build Tools": https://visualstudio.microsoft.com/visual-cpp-build-tools/.
            These build tools are used for the backend, that can ran on the pi.

        pip install rpi-ws281x

    Werkzeug:
        pip install Werkzeug
    
    flask_sqlalchemy:
        pip install flask_sqlalchemy
    
    flask_cors:
        pip install flask-cors


2. Goals:

    Overall:
        Understand the code

    Front-End:
        Develop a page that will allow users to change variables without asking us.

    Unit Test:
        Develop a unit testing plan
        Test-Cases

    Security:
        Scrub Text Input for not allowed characters 
        Hide SQL Command Calls
        Sessions
        Cookies 
        Login 
        Routes
    
