import React, { useState } from 'react';
import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';
import FormHelperText from '@mui/material/FormHelperText';
import Button from '@mui/material/Button';
import { FormControl, InputLabel, Input} from '@mui/material';
// CHANGE: Added savePreset API import (currently unused - using localStorage instead)
// Reason: Backend preset endpoints (/preset/save) not yet implemented in sbBackend.py
// This import is kept for future migration to backend storage when endpoints are ready
import { savePreset } from '../../utilities/api';

/**
 * PresetManager Component
 * CHANGE: Completely rewrote to save presets to localStorage instead of backend API
 * 
 * PURPOSE:
 * Allows users to create and save custom trial configurations (presets) that can be
 * quickly loaded in TestManager component's preset dropdown.
 * 
 * FUNCTIONALITY:
 * - Collects all trial parameters (duration, goal, cooldown, reward type, etc.)
 * - Validates required fields before saving
 * - Stores presets in browser's localStorage as JSON array
 * - Provides success feedback and clears form after save
 * 
 * DATA FLOW:
 * PresetManager (save to localStorage) → TestManager (load from localStorage) → Dropdown display
 * 
 * @param {Function} onCreatePreset - Optional callback to parent component when preset is created
 */
const PresetManager = ({ onCreatePreset }) => {
    const [presetName, setPresetName] = useState('');
    const [presetDescription, setPresetDescription] = useState('');
    const [prestTrialDuration, setPresetTrialDuration] = useState('');
    const [presetTrialGoal, setPresetTrialGoal] = useState('');
    const [presetTrialCooldown, setPresetTrialCooldown] = useState('');
    const [presetRewardType, setPresetRewardType] = useState('');
    const [presetInteractionType, setPresetInteractionType] = useState('');
    const [presetStimulasType, setPresetStimulasType] = useState('');
    const [presetLightColor, setPresetLightColor] = useState('');
    const [error, setError] = useState('');

    /**
     * CHANGE: Completely rewrote handlePresetSave function to use localStorage
     * Previous version: Called backend API via savePreset() - always failed (endpoints not implemented)
     * New version: Directly saves to browser localStorage - works immediately
     * 
     * IMPLEMENTATION DETAILS:
     * 1. Validates required fields (name, duration, goal, cooldown)
     * 2. Creates preset object with all configuration values
     * 3. Retrieves existing presets array from localStorage
     * 4. Appends new preset to array
     * 5. Saves updated array back to localStorage as JSON string
     * 6. Calls optional parent callback for component communication
     * 7. Shows success message to user
     * 8. Clears all form fields for next preset creation
     * 
     * STORAGE FORMAT:
     * localStorage key: 'userPresets'
     * Value: JSON array of preset objects
     * Example: [{name: "FastTest", trialDuration: "5", goalForTrial: "10", ...}, ...]
     * 
     * ERROR HANDLING:
     * Currently shows alert for missing required fields
     * No try/catch - assumes localStorage is available (may fail in private browsing)
     */
    const handlePresetSave = () => {
    // CHANGE: Simplified validation - only checks 4 required fields
    // Previous version had async/await for API call that would fail
    if (!presetName || !prestTrialDuration || !presetTrialGoal || !presetTrialCooldown) {
        alert("Please fill in all required fields.");
        return;
    }

    // CHANGE: Create preset object matching TestManager's expected structure
    // Object keys must match what TestManager's handlePreset() expects
    const newPreset = {
        name: presetName,                           // Unique identifier for dropdown
        trialDuration: prestTrialDuration,          // Minutes for trial
        goalForTrial: presetTrialGoal,              // Interactions needed for reward
        cooldown: presetTrialCooldown,              // Seconds between rewards
        rewardType: presetRewardType,               // "Water" or "Food"
        interactionType: presetInteractionType,     // "Lever" or "Poke"
        stimulusType: presetStimulasType,           // "Light" or "Tone"
        lightColor: presetLightColor                // "Red", "Green", "Blue", "Yellow"
    };

    // CHANGE: Read existing presets from localStorage (NEW - not using backend API)
    // Parse JSON string to array, default to empty array if key doesn't exist
    const existingPresets = JSON.parse(localStorage.getItem('userPresets') || '[]');
    
    // CHANGE: Append new preset to existing array
    // NOTE: This allows duplicate names - could add uniqueness check in future
    existingPresets.push(newPreset);
    
    // CHANGE: Save updated array back to localStorage as JSON string
    // Overwrites previous 'userPresets' value with new array including added preset
    localStorage.setItem('userPresets', JSON.stringify(existingPresets));
    
    // CHANGE: Call optional parent callback for component communication
    // Allows parent component to react to preset creation (refresh list, etc.)
    if (onCreatePreset) {
        onCreatePreset(newPreset);
    }
    
    // CHANGE: User feedback - confirms save was successful
    alert(`Preset "${presetName}" saved successfully!`);
    
    // CHANGE: Clear all form fields after successful save
    // Prepares form for creating another preset
    // Previous version had commented out "// ... clear other fields"
    setPresetName('');
    setPresetTrialDuration('');
    setPresetTrialGoal('');
    setPresetTrialCooldown('');
    setPresetRewardType('');
    setPresetInteractionType('');
    setPresetStimulasType('');
    setPresetLightColor('');
};

    // COMPONENT STRUCTURE:
    // Form mirrors TestManager's input fields but for preset creation instead of trial execution
    // All inputs are unvalidated (no error states) - validation only checks if required fields are filled
    // Uses same MUI components and CSS classes as TestManager for consistency
    return (
        <div className="trial-settings">
            <div id = "formControlContainer">
               {/* PRESET NAME INPUT - Required field */}
               {/* Becomes the display name in TestManager's preset dropdown */}
               <div className="input-group">
                    <FormControl  fullWidth >
                        <InputLabel htmlFor="presetNameLabel">Preset Name:</InputLabel>
                        <Input
                            id="testName"
                            placeholder="Enter Preset Name/Number"
                            required
                            value={presetName}
                            onChange = {(e) => setPresetName(e.target.value)}
                        />
                            <FormHelperText>
                                {/* {testNameError} */}
                            </FormHelperText>
                    </FormControl>
                </div>

                 <div className="input-group">
                    <FormControl fullWidth>
                    <InputLabel htmlFor="presetTrialDurationLabel">Trial Duration(Minutes):</InputLabel>
                    <Input
                        id="trialDuration"
                        placeholder="Enter Preset Trial Duration"
                        required
                        min = "0"
                        value={prestTrialDuration}
                        onChange = {(e) => setPresetTrialDuration(e.target.value)}
                    />
                    <FormHelperText>
                        {/* {trialDurationError} */}
                    </FormHelperText>
                    </FormControl>
                </div>

                <div className="input-group">
                    <FormControl fullWidth>
                    <InputLabel htmlFor="goalForTrialLabel">Goal for Trial:</InputLabel>
                    <Input
                        id="goalForTrial"
                        placeholder="Enter PresetGoal"
                        required
                        value={presetTrialGoal}
                        onChange = {(e) => setPresetTrialGoal(e.target.value)}
                    />
                    <FormHelperText>
                        {/* {trialGoalError} */}
                    </FormHelperText>
                    </FormControl>
                </div>

                <div className="input-group">
                    <FormControl fullWidth>
                    <InputLabel htmlFor="cooldownLabel">Cooldown:</InputLabel>
                    <Input
                        id="cooldown"
                        placeholder="Enter Preset Cooldown"
                        required
                        min = "0"
                        value={presetTrialCooldown}
                        onChange = {(e) => setPresetTrialCooldown(e.target.value)}
                    />
                    <FormHelperText>
                        {/* {coolDownError} */}
                    </FormHelperText>
                    </FormControl>
                </div>


                <div className="input-group">
                    <FormControl fullWidth>
                        <InputLabel id="rewardTypeLabel">Reward Type:</InputLabel>
                        <Select
                            id="rewardType"
                            value={presetRewardType}
                            onChange = {(e) => setPresetRewardType(e.target.value)}
                        >
                            <MenuItem value={"Water"}>Water</MenuItem>
                            <MenuItem value={"Food"}>Food</MenuItem>
                        </Select>
                    </FormControl>
                </div>

                <div className="input-group">
                    <FormControl fullWidth>
                        <InputLabel id="interactionTypeLabel">Interaction Type:</InputLabel>
                            <Select
                            id="interactionType"
                            value={presetInteractionType}
                            onChange = {(e) => setPresetInteractionType(e.target.value)}
                        >
                        <MenuItem value={"Poke"}>Poke</MenuItem>
                        <MenuItem value={"Lever"}>Lever</MenuItem>
                        </Select>
                    </FormControl>
                </div>

                <div className="input-group">
                    <FormControl fullWidth>
                    <InputLabel id="stimulusTypeLabel">Stimulus Type:</InputLabel>
                        <Select
                        id="stimulasType"
                        value={presetStimulasType}
                        onChange = {(e) => setPresetStimulasType(e.target.value)}
                        >
                        <MenuItem value={"Light"}>Light</MenuItem>
                        <MenuItem value={"Tone"}>Tone</MenuItem>
                        </Select>
                    </FormControl>
                </div>

                <div className="input-group">
                    <FormControl fullWidth>
                        <InputLabel id="lightColorLabel">Light Color:</InputLabel>
                        <Select
                            id="lightColor"
                            value={presetLightColor}
                            onChange = {(e) => setPresetLightColor(e.target.value)}
                        >
                            <MenuItem value={"Red"}>Red</MenuItem>
                            <MenuItem value={"Green"}>Green</MenuItem>
                            <MenuItem value={"Blue"}>Blue</MenuItem>
                            <MenuItem value={"Yellow"}>Yellow</MenuItem>
                        </Select>
                    </FormControl>
                </div>  

                <div className="input-group">
                    <Button className="save-button" onClick={handlePresetSave}>Save Preset</Button>
                </div>
            </div>  
        </div>
    );
};

export default PresetManager;