
export const validationFunctions = {
    // Creating a function that is called testNameValidation, that serves the purpose of validating the test name input.
    testNameValidation: (value) => {
        // Creating a variable that is used to store what characters that aren't allowed
        const restrictedCharsRegex = /[<>&"'\/\-;\\^\%\+:\(\)\{\}\[\]\s\x00-\x1F\x7F]/g;
        // Creating a try-catch block that will be used to create a security block around the logic.
        try {
            const converted = (value ?? "").replace(restrictedCharsRegex, "");
            if (converted === "" && (value ?? "") !== "") {
                return {
                    value: converted,
                    error: "Test name cannot be empty after removing restricted characters",
                };
            }
            return { value: converted, error: "" };
        } catch (e) {
            return { value: "", error: "Validation error occurred" };
        }
    },

    testTrialDurtion: (value) => {
        const nonDigits = /[^\d]/g; // strip non-digits
        try {
            const input = value ?? "";
            const converted = input.replace(nonDigits, "");
            if (input !== "" && converted === "") {
                return { value: converted, error: "Only numbers are allowed" };
            }
            return { value: converted, error: "" };
        } catch (e) {
            return { value: "", error: "Validation error occurred" };
        }
    },

    testTrialGoal: (value) => {
        const nonDigits = /[^\d]/g; // numeric goal only
        try {
            const input = value ?? "";
            const converted = input.replace(nonDigits, "");
            if (input !== "" && converted === "") {
                return { value: converted, error: "Only numbers are allowed" };
            }
            return { value: converted, error: "" };
        } catch (e) {
            return { value: "", error: "Validation error occurred" };
        }
    },

    testCoolDown: (value) => {
        const nonDigits = /[^\d]/g; // numeric cooldown only
        try {
            const input = value ?? "";
            const converted = input.replace(nonDigits, "");
            if (input !== "" && converted === "") {
                return { value: converted, error: "Only numbers are allowed" };
            }
            return { value: converted, error: "" };
        } catch (e) {
            return { value: "", error: "Validation error occurred" };
        }
    },
};
