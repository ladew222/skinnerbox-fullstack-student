import React, { useState, useEffect } from "react";
import "./ResultsList.css";
import { deleteResult, getResults } from "../../utilities/api";
import { useAuth } from "../../context/AuthContext";
import {
  buildStimulusSummary,
  buildTraditionalCsv,
  buildTraditionalCsvRows,
  formatSecondsForDisplay,
} from "../../utilities/resultsCsv";

const ResultsList = () => {
  const { isAdmin } = useAuth();
  const [selectedTest, setSelectedTest] = useState(null);
  const [selectedTestIds, setSelectedTestIds] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [feedbackMessage, setFeedbackMessage] = useState("");
  const [testData, setTestData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [deleteBusyId, setDeleteBusyId] = useState("");

  useEffect(() => {
    const fetchResults = async () => {
      try {
        const data = await getResults();
        setTestData(Array.isArray(data) ? data : []);
        setErrorMessage("");
      } catch (error) {
        setErrorMessage(error?.message || "Unable to fetch results. Please try again later.");
      } finally {
        setLoading(false);
      }
    };

    fetchResults();
  }, []);

  const filteredTests = testData.filter((test) =>
    test.name.toLowerCase().includes(searchQuery.toLowerCase())
  );
  const allVisibleSelected = Boolean(filteredTests.length)
    && filteredTests.every((test) => selectedTestIds.includes(String(test.id)));

  const buildCsvRecord = (test) => ({
    exportedAt: new Date().toISOString(),
    testName: test.name,
    subjectId: test.subjectId ?? "",
    conductedByDisplayName: test.conductedBy?.displayName ?? "",
    conductedByEmail: test.conductedBy?.email ?? "",
    conductedByUserId: test.conductedBy?.id ?? "",
    status: test.status,
    complete: test.complete,
    preset: "",
    configuredDurationMinutes: test.configuredDurationMinutes,
    configuredDurationSeconds: test.configuredDurationSeconds,
    elapsedTimeSeconds: test.elapsedTimeSeconds,
    remainingTimeSeconds: test.remainingTimeSeconds,
    goalForTrial: test.goalForTrial,
    goalForTest: test.goalForTest,
    rewardDelaySeconds: test.rewardDelaySeconds,
    stimulusDurationSeconds: test.stimulusDurationSeconds,
    cooldownSeconds: test.cooldownSeconds,
    rewardType: test.rewardType,
    interactionType: test.interactionType,
    stimulusType: test.stimulusType,
    stimulusDescription: test.stimulusDescription,
    lightColor: test.lightColor,
    endChimeEnabled: test.endChimeEnabled,
    endChimePattern: test.endChimePattern,
    leverPressCount: test.leverPressCount,
    nosePokeCount: test.nosePokeCount,
    totalInteractions: test.totalPresses,
    rewardCount: test.rewardCount,
    createdAt: test.createdAt ?? "",
    updatedAt: test.updatedAt ?? "",
  });

  const formatTrialDate = (test) => {
    const rawTimestamp = test.updatedAt || test.createdAt;
    if (!rawTimestamp) {
      return "Date unavailable";
    }

    const parsedDate = new Date(rawTimestamp);
    if (Number.isNaN(parsedDate.getTime())) {
      return "Date unavailable";
    }

    return new Intl.DateTimeFormat(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(parsedDate);
  };

  const formatConductedBy = (test) => {
    const displayName = test.conductedBy?.displayName?.trim();
    const email = test.conductedBy?.email?.trim();
    if (displayName && email) {
      return `${displayName} (${email})`;
    }
    if (displayName) {
      return displayName;
    }
    if (email) {
      return email;
    }
    return "Unknown user";
  };

  const handleDeleteResult = async (event, resultId) => {
    event.stopPropagation();

    const targetResult = testData.find((test) => String(test.id) === String(resultId));
    const trialLabel = targetResult?.name || "this saved trial";
    if (!window.confirm(`Delete ${trialLabel}? This cannot be undone.`)) {
      return;
    }

    try {
      setDeleteBusyId(String(resultId));
      setErrorMessage("");
      setFeedbackMessage("");
      const response = await deleteResult(resultId);
      setTestData((currentTests) =>
        currentTests.filter((test) => String(test.id) !== String(resultId))
      );
      setSelectedTestIds((currentSelectedIds) =>
        currentSelectedIds.filter((selectedId) => selectedId !== String(resultId))
      );
      setSelectedTest((currentSelectedTest) =>
        currentSelectedTest && String(currentSelectedTest.id) === String(resultId)
          ? null
          : currentSelectedTest
      );
      setFeedbackMessage(response.message || "Saved trial deleted successfully.");
    } catch (error) {
      setErrorMessage(error?.message || "Unable to delete the selected saved trial.");
    } finally {
      setDeleteBusyId("");
    }
  };

  const handleDownload = () => {
    if (!selectedTest) {
      return;
    }

    const blob = new Blob([buildTraditionalCsv(buildCsvRecord(selectedTest))], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${selectedTest.name.replace(/\s+/g, "_")}_saved_result.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  };

  const handleToggleSelected = (event, resultId) => {
    event.stopPropagation();
    const normalizedResultId = String(resultId);
    setSelectedTestIds((currentSelectedIds) =>
      currentSelectedIds.includes(normalizedResultId)
        ? currentSelectedIds.filter((selectedId) => selectedId !== normalizedResultId)
        : [...currentSelectedIds, normalizedResultId]
    );
  };

  const handleToggleSelectAllVisible = () => {
    const visibleIds = filteredTests.map((test) => String(test.id));
    if (allVisibleSelected) {
      setSelectedTestIds((currentSelectedIds) =>
        currentSelectedIds.filter((selectedId) => !visibleIds.includes(selectedId))
      );
      return;
    }

    setSelectedTestIds((currentSelectedIds) =>
      Array.from(new Set([...currentSelectedIds, ...visibleIds]))
    );
  };

  const handleDownloadSelected = () => {
    if (!selectedTestIds.length) {
      return;
    }

    const selectedTests = testData.filter((test) => selectedTestIds.includes(String(test.id)));
    if (!selectedTests.length) {
      return;
    }

    const csvData = buildTraditionalCsvRows(selectedTests.map(buildCsvRecord));
    const blob = new Blob([csvData], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `selected_saved_results_${selectedTests.length}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  };

  return (
    <div className="results-container">
      <div className="test-list">
        <h2>Available Trials</h2>
        <input
          type="text"
          placeholder="Search tests..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="search-bar"
        />
        <div className="results-toolbar">
          <button
            type="button"
            className="results-toolbar-button"
            onClick={handleToggleSelectAllVisible}
            disabled={!filteredTests.length}
          >
            {allVisibleSelected ? "Clear Visible" : "Select Visible"}
          </button>
          <button
            type="button"
            className="results-toolbar-button primary"
            onClick={handleDownloadSelected}
            disabled={!selectedTestIds.length}
          >
            Download Selected CSV ({selectedTestIds.length})
          </button>
        </div>
        {loading ? (
          <p>Loading...</p>
        ) : (
          <ul>
            {filteredTests.map((test) => (
              <li key={test.id} onClick={() => setSelectedTest(test)} className="test-item">
                <input
                  type="checkbox"
                  className="trial-select-checkbox"
                  checked={selectedTestIds.includes(String(test.id))}
                  onChange={(event) => handleToggleSelected(event, test.id)}
                  onClick={(event) => event.stopPropagation()}
                  aria-label={`Select ${test.name}`}
                />
                <div className="test-item-copy">
                  <span className="test-item-name">{test.name}</span>
                  <span className="test-item-date">{formatTrialDate(test)}</span>
                  <span className="test-item-operator">By {formatConductedBy(test)}</span>
                </div>
                {isAdmin && (
                  <button
                    type="button"
                    className="delete-trial-button"
                    onClick={(event) => handleDeleteResult(event, test.id)}
                    disabled={deleteBusyId === String(test.id)}
                  >
                    {deleteBusyId === String(test.id) ? "Deleting..." : "Delete"}
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
        {feedbackMessage && <p className="feedback-message">{feedbackMessage}</p>}
        {errorMessage && <p className="error-message">{errorMessage}</p>}
      </div>

      {selectedTest && (
        <div className="test-details">
          <button className="close-button" onClick={() => setSelectedTest(null)}>X</button>
          <h2>{selectedTest.name} Summary</h2>
          <div className="test-summary">
            <p><strong>Saved:</strong> {formatTrialDate(selectedTest)}</p>
            <p><strong>Conducted By:</strong> {formatConductedBy(selectedTest)}</p>
            <p><strong>Status:</strong> {selectedTest.complete ? "Complete" : selectedTest.status}</p>
            <p><strong>Goal For Trial:</strong> {selectedTest.goalForTrial}</p>
            <p><strong>Goal For Test:</strong> {selectedTest.goalForTest}</p>
            <p><strong>Lever Presses:</strong> {selectedTest.leverPressCount}</p>
            <p><strong>Nose Pokes:</strong> {selectedTest.nosePokeCount}</p>
            <p><strong>Total Interactions:</strong> {selectedTest.totalPresses}</p>
            <p><strong>Rewards Given:</strong> {selectedTest.rewardCount}</p>
            <p><strong>Configured Duration:</strong> {formatSecondsForDisplay(selectedTest.configuredDurationSeconds)}</p>
            <p><strong>Elapsed Time:</strong> {formatSecondsForDisplay(selectedTest.elapsedTimeSeconds)}</p>
            <p><strong>Time Remaining:</strong> {formatSecondsForDisplay(selectedTest.remainingTimeSeconds)}</p>
            <p><strong>Reward Type:</strong> {selectedTest.rewardType}</p>
            <p><strong>Stimulus:</strong> {selectedTest.stimulusDescription || buildStimulusSummary(selectedTest.stimulusType, selectedTest.lightColor)}</p>
            <p><strong>Interaction Type:</strong> {selectedTest.interactionType}</p>
            <p><strong>End Chime:</strong> {selectedTest.endChimeEnabled ? 'Enabled' : 'Disabled'}</p>
            {selectedTest.endChimeEnabled && (
              <p><strong>End Chime Pattern:</strong> {selectedTest.endChimePattern}</p>
            )}
          </div>
          <button className="download-button" onClick={handleDownload}>Download Data</button>
          {isAdmin && (
            <button
              className="delete-trial-button details-delete-button"
              onClick={(event) => handleDeleteResult(event, selectedTest.id)}
              disabled={deleteBusyId === String(selectedTest.id)}
            >
              {deleteBusyId === String(selectedTest.id) ? "Deleting..." : "Delete Trial"}
            </button>
          )}
        </div>
      )}
    </div>
  );
};

export default ResultsList;
