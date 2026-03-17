import React, { useState, useEffect } from "react";
import "./ResultsList.css";
import {
  buildResultSnapshotUrl,
  deleteResult,
  deleteResults,
  getResults,
} from "../../utilities/api";
import { useAuth } from "../../context/AuthContext";
import { BarChart } from "@mui/x-charts/BarChart";
import { LineChart } from "@mui/x-charts/LineChart";
import { PieChart } from "@mui/x-charts/PieChart";
import {
  buildEventTimelineCsv,
  buildStimulusSummary,
  buildTraditionalCsv,
  buildTraditionalCsvRows,
  formatEndChimeStatus,
  formatSecondsForDisplay,
} from "../../utilities/resultsCsv";

const formatAverageValue = (value) => Number(value || 0).toFixed(1);

const formatSummaryCount = (count, singularLabel, pluralLabel = `${singularLabel}s`) =>
  `${count} ${count === 1 ? singularLabel : pluralLabel}`;

const truncateChartLabel = (value, maxLength = 16) => {
  const normalizedValue = String(value || "");
  if (normalizedValue.length <= maxLength) {
    return normalizedValue;
  }
  return `${normalizedValue.slice(0, maxLength - 1)}…`;
};

const buildTimelineTrendPoints = (events = []) => {
  const normalizedEvents = (Array.isArray(events) ? events : [])
    .map((event) => ({
      ...event,
      elapsedSeconds: Number.isFinite(Number(event?.elapsedSeconds))
        ? Math.max(Number(event.elapsedSeconds), 0)
        : 0,
    }))
    .sort((left, right) => left.elapsedSeconds - right.elapsedSeconds);

  let leverPresses = 0;
  let nosePokes = 0;
  let rewards = 0;

  const points = [{
    elapsedSeconds: 0,
    leverPresses: 0,
    nosePokes: 0,
    rewards: 0,
  }];

  normalizedEvents.forEach((event) => {
    if (event.type === "lever_press") {
      leverPresses += 1;
    } else if (event.type === "nose_poke") {
      nosePokes += 1;
    } else if (event.type === "reward_delivered") {
      rewards += 1;
    }

    points.push({
      elapsedSeconds: event.elapsedSeconds,
      leverPresses,
      nosePokes,
      rewards,
    });
  });

  return points;
};

const ResultsList = () => {
  const { isAdmin } = useAuth();
  const [selectedTest, setSelectedTest] = useState(null);
  const [selectedTestIds, setSelectedTestIds] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [feedbackMessage, setFeedbackMessage] = useState("");
  const [testData, setTestData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [deleteBusyIds, setDeleteBusyIds] = useState([]);
  const [showTimelineTrends, setShowTimelineTrends] = useState(false);

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
  const summaryTests = selectedTestIds.length
    ? testData.filter((test) => selectedTestIds.includes(String(test.id)))
    : filteredTests;
  const completedSummaryCount = summaryTests.filter((test) => Boolean(test.complete)).length;
  const incompleteSummaryCount = Math.max(summaryTests.length - completedSummaryCount, 0);
  const completionRate = summaryTests.length
    ? Math.round((completedSummaryCount / summaryTests.length) * 100)
    : 0;
  const averageLeverPresses = summaryTests.length
    ? summaryTests.reduce((total, test) => total + Number(test.leverPressCount || 0), 0) / summaryTests.length
    : 0;
  const averageNosePokes = summaryTests.length
    ? summaryTests.reduce((total, test) => total + Number(test.nosePokeCount || 0), 0) / summaryTests.length
    : 0;
  const averageRewards = summaryTests.length
    ? summaryTests.reduce((total, test) => total + Number(test.rewardCount || 0), 0) / summaryTests.length
    : 0;
  const maxAverageMetric = Math.max(averageLeverPresses, averageNosePokes, averageRewards, 1);
  const averageMetricRows = [
    {
      label: "Lever Presses",
      value: averageLeverPresses,
      toneClassName: "lever",
    },
    {
      label: "Nose Pokes",
      value: averageNosePokes,
      toneClassName: "nose",
    },
    {
      label: "Rewards",
      value: averageRewards,
      toneClassName: "reward",
    },
  ];
  const interactionsByTrial = summaryTests
    .map((test) => ({
      id: test.id,
      name: test.name,
      value: test.totalPresses !== null && test.totalPresses !== undefined
        ? Number(test.totalPresses)
        : Number(test.leverPressCount || 0) + Number(test.nosePokeCount || 0),
    }))
    .sort((left, right) => right.value - left.value)
    .slice(0, 6);
  const stimulusSummaryMap = summaryTests.reduce((summaryMap, test) => {
    const label = test.stimulusDescription || buildStimulusSummary(test.stimulusType, test.lightColor);
    summaryMap.set(label, (summaryMap.get(label) || 0) + 1);
    return summaryMap;
  }, new Map());
  const stimulusSummaryRows = Array.from(stimulusSummaryMap.entries())
    .map(([label, value]) => ({ label, value }))
    .sort((left, right) => right.value - left.value);
  const summaryScopeLabel = selectedTestIds.length
    ? `Showing ${formatSummaryCount(summaryTests.length, "selected trial")} in the charts below.`
    : `Showing ${formatSummaryCount(summaryTests.length, "visible trial")} based on the current search.`;
  const completionPieData = [
    { id: "complete", value: completedSummaryCount, label: "Complete", color: "#0f74bd" },
    { id: "incomplete", value: incompleteSummaryCount, label: "Incomplete", color: "#d0d9e6" },
  ].filter((item) => item.value > 0);
  const averageResponseChartData = averageMetricRows.map((row) => row.value);
  const averageResponseChartLabels = averageMetricRows.map((row) => row.label);
  const interactionsChartData = interactionsByTrial.map((trial) => trial.value);
  const interactionsChartLabels = interactionsByTrial.map((trial) => truncateChartLabel(trial.name));
  const selectedComparisonTests = selectedTestIds.length
    ? testData.filter((test) => selectedTestIds.includes(String(test.id)))
    : [];
  const selectedTimelineEvents = Array.isArray(selectedTest?.eventTimeline)
    ? selectedTest.eventTimeline
    : [];
  const selectedSnapshotUrl = selectedTest?.hasCameraSnapshot
    ? buildResultSnapshotUrl(selectedTest.id, selectedTest.cameraSnapshotCapturedAt || Date.now())
    : "";
  const hasSelectedTimeline = selectedTimelineEvents.length > 0;
  const timelineTrendPoints = hasSelectedTimeline
    ? buildTimelineTrendPoints(selectedTimelineEvents)
    : [];
  const timelineTrendXAxis = timelineTrendPoints.map((point) => point.elapsedSeconds);
  const timelineTrendMaxCount = timelineTrendPoints.length
    ? Math.max(
      ...timelineTrendPoints.map((point) =>
        Math.max(point.leverPresses, point.nosePokes, point.rewards)
      ),
      1
    )
    : 1;
  const selectedTimelineSummary = selectedTimelineEvents.reduce((summary, event) => {
    const nextSummary = { ...summary };
    if (event?.type === "lever_press") {
      nextSummary.leverPresses += 1;
    } else if (event?.type === "nose_poke") {
      nextSummary.nosePokes += 1;
    } else if (event?.type === "reward_delivered") {
      nextSummary.rewards += 1;
    } else if (event?.type === "note") {
      nextSummary.notes += 1;
    }
    return nextSummary;
  }, {
    leverPresses: 0,
    nosePokes: 0,
    rewards: 0,
    notes: 0,
  });

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
    endChimeEnabled: formatEndChimeStatus(test.endChimeEnabled),
    endChimePattern: '',
    leverPressCount: test.leverPressCount,
    validLeverPressCount: test.validLeverPressCount ?? 0,
    invalidLeverPressCount: test.invalidLeverPressCount ?? 0,
    nosePokeCount: test.nosePokeCount,
    validNosePokeCount: test.validNosePokeCount ?? 0,
    invalidNosePokeCount: test.invalidNosePokeCount ?? 0,
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

  const formatSubjectId = (test) => {
    const subjectId = test?.subjectId;
    if (subjectId === null || subjectId === undefined || subjectId === '') {
      return 'Not tracked';
    }
    return subjectId;
  };

  const removeResultsFromState = (resultIds) => {
    const normalizedIds = resultIds.map((resultId) => String(resultId));

    setTestData((currentTests) =>
      currentTests.filter((test) => !normalizedIds.includes(String(test.id)))
    );
    setSelectedTestIds((currentSelectedIds) =>
      currentSelectedIds.filter((selectedId) => !normalizedIds.includes(selectedId))
    );
    setSelectedTest((currentSelectedTest) =>
      currentSelectedTest && normalizedIds.includes(String(currentSelectedTest.id))
        ? null
        : currentSelectedTest
    );
  };

  const handleDeleteResult = async (event, resultId) => {
    event.stopPropagation();

    const targetResult = testData.find((test) => String(test.id) === String(resultId));
    const trialLabel = targetResult?.name || "this saved trial";
    if (!window.confirm(`Delete ${trialLabel}? This cannot be undone.`)) {
      return;
    }

    try {
      setDeleteBusyIds([String(resultId)]);
      setErrorMessage("");
      setFeedbackMessage("");
      const response = await deleteResult(resultId);
      removeResultsFromState([resultId]);
      setFeedbackMessage(response.message || "Saved trial deleted successfully.");
    } catch (error) {
      setErrorMessage(error?.message || "Unable to delete the selected saved trial.");
    } finally {
      setDeleteBusyIds([]);
    }
  };

  const handleDeleteSelected = async () => {
    if (!selectedTestIds.length) {
      return;
    }

    const selectedTests = testData.filter((test) => selectedTestIds.includes(String(test.id)));
    const trialCount = selectedTests.length;
    if (!window.confirm(`Delete ${trialCount} selected trial${trialCount === 1 ? "" : "s"}? This cannot be undone.`)) {
      return;
    }

    const idsToDelete = selectedTests.map((test) => String(test.id));

    try {
      setDeleteBusyIds(idsToDelete);
      setErrorMessage("");
      setFeedbackMessage("");
      const response = await deleteResults(idsToDelete);
      const deletedIds = Array.isArray(response?.deletedIds) ? response.deletedIds : [];
      const missingIds = Array.isArray(response?.missingIds) ? response.missingIds : [];
      const failedIds = Array.isArray(response?.failedIds) ? response.failedIds : [];

      if (deletedIds.length) {
        removeResultsFromState(deletedIds);
      }

      if (failedIds.length && missingIds.length) {
        setFeedbackMessage(
          `Deleted ${deletedIds.length} saved trial${deletedIds.length === 1 ? "" : "s"}. `
          + `${missingIds.length} were already missing and ${failedIds.length} could not be deleted.`
        );
      } else if (failedIds.length) {
        setFeedbackMessage(
          `Deleted ${deletedIds.length} saved trial${deletedIds.length === 1 ? "" : "s"}. `
          + `${failedIds.length} could not be deleted and remain in the list.`
        );
      } else if (missingIds.length) {
        setFeedbackMessage(
          `Deleted ${deletedIds.length} saved trial${deletedIds.length === 1 ? "" : "s"}. `
          + `${missingIds.length} could not be found anymore and were skipped.`
        );
      } else {
        setFeedbackMessage(
          response?.message
            || `${deletedIds.length} saved trial${deletedIds.length === 1 ? "" : "s"} deleted successfully.`
        );
      }
    } catch (error) {
      setErrorMessage(error?.message || "Unable to delete the selected saved trials.");
    } finally {
      setDeleteBusyIds([]);
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

  const handleDownloadTimeline = () => {
    if (!selectedTest) {
      return;
    }

    const csvData = buildEventTimelineCsv({
      testName: selectedTest.name,
      subjectId: selectedTest.subjectId ?? "",
      conductedByDisplayName: selectedTest.conductedBy?.displayName ?? "",
      conductedByEmail: selectedTest.conductedBy?.email ?? "",
      events: selectedTest.eventTimeline || [],
    });
    const blob = new Blob([csvData], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${selectedTest.name.replace(/\s+/g, "_")}_timeline.csv`;
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
          {isAdmin && (
            <button
              type="button"
              className="results-toolbar-button danger"
              onClick={handleDeleteSelected}
              disabled={!selectedTestIds.length || deleteBusyIds.length > 0}
            >
              {deleteBusyIds.length > 0 ? "Deleting..." : `Delete Selected (${selectedTestIds.length})`}
            </button>
          )}
        </div>
        {loading ? (
          <p>Loading...</p>
        ) : (
          <ul>
            {filteredTests.map((test) => (
              <li
                key={test.id}
                onClick={() => {
                  setSelectedTest(test);
                  setShowTimelineTrends(false);
                }}
                className="test-item"
              >
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
                    disabled={deleteBusyIds.includes(String(test.id))}
                  >
                    {deleteBusyIds.includes(String(test.id)) ? "Deleting..." : "Delete"}
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
        {feedbackMessage && <p className="feedback-message">{feedbackMessage}</p>}
        {errorMessage && <p className="error-message">{errorMessage}</p>}
      </div>

      <div className="results-main-column">
        <section className="results-analytics" aria-label="Results Snapshot">
          <div className="results-analytics-header">
            <div>
              <h2>Results Snapshot</h2>
              <p>{summaryScopeLabel}</p>
            </div>
            <div className="results-analytics-badge">
              {summaryTests.length ? `${completionRate}% complete` : 'No trials yet'}
            </div>
          </div>

          {summaryTests.length ? (
            <div className="results-analytics-grid">
              <div className="chart-card">
                <h3>Completion Overview</h3>
                <PieChart
                  height={220}
                  skipAnimation
                  hideLegend
                  margin={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  series={[
                    {
                      innerRadius: 42,
                      outerRadius: 82,
                      paddingAngle: 2,
                      cornerRadius: 4,
                      data: completionPieData.length
                        ? completionPieData
                        : [{ id: "empty", value: 1, label: "No data", color: "#d0d9e6" }],
                      arcLabel: (item) => (item.value > 0 && summaryTests.length ? `${item.value}` : ""),
                    },
                  ]}
                />
                <div className="chart-stat-row">
                  <div>
                    <strong>{completedSummaryCount}</strong>
                    <span>Complete</span>
                  </div>
                  <div>
                    <strong>{incompleteSummaryCount}</strong>
                    <span>Incomplete</span>
                  </div>
                  <div>
                    <strong>{summaryTests.length}</strong>
                    <span>Total</span>
                  </div>
                </div>
              </div>

              <div className="chart-card">
                <h3>Average Response Profile</h3>
                <BarChart
                  height={240}
                  skipAnimation
                  borderRadius={6}
                  xAxis={[
                    {
                      scaleType: "band",
                      data: averageResponseChartLabels,
                      label: "Response Metric",
                      tickLabelStyle: {
                        angle: -20,
                        textAnchor: "end",
                        fontSize: 11,
                      },
                    },
                  ]}
                  yAxis={[
                    {
                      min: 0,
                      max: Math.max(maxAverageMetric, 1) + 1,
                      label: "Average Count",
                    },
                  ]}
                  series={[
                    {
                      data: averageResponseChartData,
                      color: "#0f74bd",
                      valueFormatter: (value) => formatAverageValue(value),
                    },
                  ]}
                  margin={{ top: 10, bottom: 72, left: 68, right: 12 }}
                />
              </div>

              <div className="chart-card chart-card-wide">
                <h3>Interactions By Trial</h3>
                <BarChart
                  height={260}
                  skipAnimation
                  borderRadius={6}
                  xAxis={[
                    {
                      scaleType: "band",
                      data: interactionsChartLabels,
                      label: "Trial",
                      tickLabelStyle: {
                        angle: -18,
                        textAnchor: "end",
                        fontSize: 11,
                      },
                    },
                  ]}
                  yAxis={[
                    {
                      label: "Interaction Count",
                    },
                  ]}
                  series={[
                    {
                      data: interactionsChartData,
                      color: "#2851a3",
                      valueFormatter: (value) => `${value ?? 0} interactions`,
                    },
                  ]}
                  margin={{ top: 10, bottom: 76, left: 72, right: 12 }}
                />
              </div>

              <div className="chart-card">
                <h3>Stimulus Mix</h3>
                <PieChart
                  height={240}
                  skipAnimation
                  hideLegend
                  margin={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  series={[
                    {
                      innerRadius: 36,
                      outerRadius: 86,
                      paddingAngle: 3,
                      cornerRadius: 4,
                      data: stimulusSummaryRows.map((row, index) => ({
                        id: row.label,
                        value: row.value,
                        label: row.label,
                        color: ["#7a2ee6", "#2851a3", "#0f74bd", "#5d8c1f"][index % 4],
                      })),
                      arcLabel: (item) => (item.value > 0 ? `${item.value}` : ""),
                    },
                  ]}
                />
                <ul className="chart-legend-list">
                  {stimulusSummaryRows.map((row, index) => (
                    <li key={row.label}>
                      <span
                        className="chart-legend-swatch"
                        style={{ backgroundColor: ["#7a2ee6", "#2851a3", "#0f74bd", "#5d8c1f"][index % 4] }}
                      />
                      <span>{row.label}</span>
                      <strong>{row.value}</strong>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ) : (
            <p className="results-empty-state">
              Saved trials will appear here with quick charts once results are available.
            </p>
          )}
        </section>

        {selectedComparisonTests.length > 0 && (
          <section className="results-comparison-panel" aria-label="Selected Trial Comparison">
            <div className="results-comparison-header">
              <h3>Selected Trial Comparison</h3>
              <p>
                Checked trials stay in this comparison view so you can compare saved sessions side by side while still opening one detailed record below.
              </p>
            </div>
            <div className="comparison-table-wrapper">
              <table className="comparison-table">
                <thead>
                  <tr>
                    <th>Trial</th>
                    <th>Subject</th>
                    <th>Saved</th>
                    <th>Stimulus</th>
                    <th>Lever</th>
                    <th>Nose</th>
                    <th>Rewards</th>
                    <th>Elapsed</th>
                    <th>Operator</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedComparisonTests.map((test) => (
                    <tr
                      key={test.id}
                      onClick={() => {
                        setSelectedTest(test);
                        setShowTimelineTrends(false);
                      }}
                    >
                      <td>{test.name}</td>
                      <td>{formatSubjectId(test)}</td>
                      <td>{formatTrialDate(test)}</td>
                      <td>{test.stimulusDescription || buildStimulusSummary(test.stimulusType, test.lightColor)}</td>
                      <td>{test.leverPressCount ?? 0}</td>
                      <td>{test.nosePokeCount ?? 0}</td>
                      <td>{test.rewardCount ?? 0}</td>
                      <td>{formatSecondsForDisplay(test.elapsedTimeSeconds)}</td>
                      <td>{formatConductedBy(test)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {selectedTest && (
          <div className="test-details">
            <button
              className="close-button"
              onClick={() => {
                setSelectedTest(null);
                setShowTimelineTrends(false);
              }}
            >
              X
            </button>
            <h2>{selectedTest.name} Summary</h2>
            <div className="test-summary">
              <p><strong>Saved:</strong> {formatTrialDate(selectedTest)}</p>
              <p><strong>Subject ID:</strong> {formatSubjectId(selectedTest)}</p>
              <p><strong>Conducted By:</strong> {formatConductedBy(selectedTest)}</p>
              <p><strong>Status:</strong> {selectedTest.complete ? "Complete" : selectedTest.status}</p>
              <p><strong>Goal For Trial:</strong> {selectedTest.goalForTrial}</p>
              <p><strong>Goal For Test:</strong> {selectedTest.goalForTest}</p>
              <p><strong>Lever Presses:</strong> {selectedTest.leverPressCount}</p>
              <p><strong>Valid Lever Presses:</strong> {selectedTest.validLeverPressCount ?? 0}</p>
              <p><strong>Invalid Lever Presses:</strong> {selectedTest.invalidLeverPressCount ?? 0}</p>
              <p><strong>Nose Pokes:</strong> {selectedTest.nosePokeCount}</p>
              <p><strong>Valid Nose Pokes:</strong> {selectedTest.validNosePokeCount ?? 0}</p>
              <p><strong>Invalid Nose Pokes:</strong> {selectedTest.invalidNosePokeCount ?? 0}</p>
              <p><strong>Total Interactions:</strong> {selectedTest.totalPresses}</p>
              <p><strong>Rewards Given:</strong> {selectedTest.rewardCount}</p>
              <p><strong>Configured Duration:</strong> {formatSecondsForDisplay(selectedTest.configuredDurationSeconds)}</p>
              <p><strong>Elapsed Time:</strong> {formatSecondsForDisplay(selectedTest.elapsedTimeSeconds)}</p>
              <p><strong>Time Remaining:</strong> {formatSecondsForDisplay(selectedTest.remainingTimeSeconds)}</p>
              <p><strong>Reward Type:</strong> {selectedTest.rewardType}</p>
              <p><strong>Stimulus:</strong> {selectedTest.stimulusDescription || buildStimulusSummary(selectedTest.stimulusType, selectedTest.lightColor)}</p>
              <p><strong>Interaction Type:</strong> {selectedTest.interactionType}</p>
              <p><strong>End Chime:</strong> {formatEndChimeStatus(selectedTest.endChimeEnabled)}</p>
              <p><strong>Event Count:</strong> {selectedTest.eventCount || 0}</p>
            </div>
            {selectedTest.notes?.length ? (
              <div className="results-notes-panel">
                <h3>Operator Notes</h3>
                <ul>
                  {selectedTest.notes.map((note) => (
                    <li key={note.id}>
                      <strong>{formatSecondsForDisplay(note.elapsedSeconds)}</strong>
                      <span>{note.detailText}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {selectedTest.hasCameraSnapshot ? (
              <div className="results-camera-panel">
                <h3>Attached Camera Snapshot</h3>
                <p>
                  One still image saved with this trial when the optional box camera was available.
                </p>
                <img
                  className="results-camera-image"
                  src={selectedSnapshotUrl}
                  alt={`${selectedTest.name} camera snapshot`}
                />
              </div>
            ) : null}
            {selectedTest.eventTimeline?.length ? (
              <div className="results-timeline-panel">
                <h3>Event Timeline</h3>
                <ul>
                  {selectedTest.eventTimeline.map((event) => (
                    <li key={event.id}>
                      <div className="results-timeline-item-meta">
                        <strong>{event.label}</strong>
                        <span>{formatSecondsForDisplay(event.elapsedSeconds)}</span>
                      </div>
                      {event.detailText && <p>{event.detailText}</p>}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            <div className="results-detail-actions">
              <button className="download-button" onClick={handleDownload}>Download Data</button>
              <button
                className="download-button"
                onClick={handleDownloadTimeline}
                disabled={!hasSelectedTimeline}
              >
                Download Timeline
              </button>
              <button
                className="download-button secondary"
                onClick={() => setShowTimelineTrends((currentValue) => !currentValue)}
                disabled={!hasSelectedTimeline}
              >
                {showTimelineTrends ? "Hide Timeline Trends" : "Show Timeline Trends"}
              </button>
            </div>
            {!hasSelectedTimeline && (
              <p className="results-detail-note">
                No event timeline is saved for this trial yet, so there is nothing to download or chart.
              </p>
            )}
            {showTimelineTrends && hasSelectedTimeline && (
              <div className="results-trend-panel">
                <div className="results-trend-header">
                  <div>
                    <h3>Timeline Trends</h3>
                    <p>Cumulative responses and rewards across the saved event timeline.</p>
                  </div>
                </div>
                <LineChart
                  height={300}
                  skipAnimation
                  xAxis={[
                    {
                      data: timelineTrendXAxis,
                      scaleType: "linear",
                      label: "Elapsed Time (seconds)",
                      valueFormatter: (value) => `${Math.round(Number(value || 0))}s`,
                    },
                  ]}
                  yAxis={[
                    {
                      min: 0,
                      max: timelineTrendMaxCount + 1,
                      label: "Cumulative Count",
                    },
                  ]}
                  series={[
                    {
                      id: "lever",
                      label: "Lever Presses",
                      data: timelineTrendPoints.map((point) => point.leverPresses),
                      color: "#0f74bd",
                      showMark: false,
                    },
                    {
                      id: "nose",
                      label: "Nose Pokes",
                      data: timelineTrendPoints.map((point) => point.nosePokes),
                      color: "#2851a3",
                      showMark: false,
                    },
                    {
                      id: "reward",
                      label: "Rewards",
                      data: timelineTrendPoints.map((point) => point.rewards),
                      color: "#5d8c1f",
                      showMark: false,
                    },
                  ]}
                  margin={{ top: 18, bottom: 62, left: 72, right: 22 }}
                />
                <div className="results-trend-stats">
                  <div>
                    <strong>{selectedTimelineSummary.leverPresses}</strong>
                    <span>Lever events</span>
                  </div>
                  <div>
                    <strong>{selectedTimelineSummary.nosePokes}</strong>
                    <span>Nose poke events</span>
                  </div>
                  <div>
                    <strong>{selectedTimelineSummary.rewards}</strong>
                    <span>Reward events</span>
                  </div>
                  <div>
                    <strong>{selectedTimelineSummary.notes}</strong>
                    <span>Operator notes</span>
                  </div>
                </div>
              </div>
            )}
            {isAdmin && (
              <button
                className="delete-trial-button details-delete-button"
                onClick={(event) => handleDeleteResult(event, selectedTest.id)}
                disabled={deleteBusyIds.includes(String(selectedTest.id))}
              >
                {deleteBusyIds.includes(String(selectedTest.id)) ? "Deleting..." : "Delete Trial"}
              </button>
            )}
          </div>
        )}
        {!selectedTest && summaryTests.length > 0 && (
          <div className="results-placeholder-card">
            <h3>Select a trial to inspect its detailed counts, notes, and event timeline.</h3>
            <p>
              The charts above summarize the current result set, and the detailed panel opens when you click any saved trial on the left.
            </p>
          </div>
        )}
        {!selectedTest && !summaryTests.length && !loading && (
          <div className="results-placeholder-card">
            <h3>No saved trials yet.</h3>
            <p>Run a test first, then return here to review CSV exports, notes, timelines, and summary charts.</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default ResultsList;
