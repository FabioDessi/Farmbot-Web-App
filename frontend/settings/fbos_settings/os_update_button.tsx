import React from "react";
import axios from "axios";
import { JobProgress } from "farmbot/dist";
import { SemverResult, semverCompare, fallbackData } from "../../util";
import { OsUpdateButtonProps } from "./interfaces";
import { checkControllerUpdates } from "../../devices/actions";
import { isString } from "lodash";
import { BotState, Feature, ShouldDisplay } from "../../devices/interfaces";
import { Actions, Content } from "../../constants";
import { t } from "../../i18next_wrapper";
import { API } from "../../api";

/** FBOS update button states. */
enum UpdateButton { upToDate, needsUpdate, needsDowngrade, unknown, none }

interface ButtonProps {
  color: "green" | "gray" | "yellow";
  text: string;
  hoverText: string | undefined;
}

/** FBOS update button state => props. */
const buttonProps =
  (status: UpdateButton, hoverText: string | undefined): ButtonProps => {
    switch (status) {
      case UpdateButton.needsUpdate:
        const upgrade = hoverText
          ? `${t("UPDATE TO")} ${hoverText}`
          : t("UPDATE");
        return { color: "green", text: upgrade, hoverText: upgrade };
      case UpdateButton.needsDowngrade:
        const downgrade = `${t("DOWNGRADE TO")} ${hoverText}`;
        return { color: "green", text: downgrade, hoverText: downgrade };
      case UpdateButton.upToDate:
        return { color: "gray", text: t("UP TO DATE"), hoverText };
      case UpdateButton.unknown:
        const text = t("Can't connect to release server");
        return { color: "yellow", text, hoverText };
      default:
        return { color: "yellow", text: t("Can't connect to bot"), hoverText };
    }
  };

/** FBOS update download in progress. */
const isWorking = (job: JobProgress | undefined) =>
  job && (job.status == "working");

/** FBOS update download progress. */
export function downloadProgress(job: JobProgress | undefined) {
  if (job && isWorking(job)) {
    switch (job.unit) {
      case "bytes":
        const kiloBytes = Math.round(job.bytes / 1024);
        const megaBytes = Math.round(job.bytes / 1048576);
        if (kiloBytes < 1) {
          return job.bytes + "B";
        } else if (megaBytes < 1) {
          return kiloBytes + "kB";
        } else {
          return megaBytes + "MB";
        }
      case "percent":
        return job.percent + "%";
    }
  }
}

/** Determine the latest available version. */
const getLatestVersion = (
  currentOSVersion: string | undefined,
  currentBetaOSVersion: string | undefined,
  betaOptIn: boolean,
): string | undefined => {
  if (!betaOptIn) { return currentOSVersion; }
  switch (semverCompare(currentOSVersion || "", currentBetaOSVersion || "")) {
    case SemverResult.RIGHT_IS_GREATER: return currentBetaOSVersion;
    default: return currentOSVersion;
  }
};

const adjustLatestVersion = (
  latestVersion: string | undefined,
  upgradePathStep: string,
  ignoreBot: boolean,
): string | undefined => {
  if (ignoreBot || !latestVersion) { return latestVersion; }
  switch (semverCompare(latestVersion, upgradePathStep)) {
    case SemverResult.LEFT_IS_GREATER: return upgradePathStep;
    default: return latestVersion;
  }
};

/** Determine the installed version. */
const getInstalledVersion = (
  controllerVersion: string | undefined,
  currentlyOnBeta: boolean,
): string | undefined => {
  if (!isString(controllerVersion)) { return undefined; }
  if (controllerVersion.includes("beta")) { return controllerVersion; }
  return currentlyOnBeta ? controllerVersion + "-beta" : controllerVersion;
};

/** Unequal beta commits => needs update. */
const betaCommitsAreEqual = (
  fbosCommit: string | undefined,
  currentBetaOSCommit: string | undefined): boolean =>
  !(isString(fbosCommit) && isString(currentBetaOSCommit)
    && fbosCommit !== currentBetaOSCommit);

/** Determine the FBOS update button state. */
const compareWithBotVersion = (
  candidate: string | undefined,
  installedVersion: string | undefined,
  allowDowngrades: boolean,
): UpdateButton => {
  if (!isString(installedVersion)) { return UpdateButton.none; }
  if (!isString(candidate)) {
    return allowDowngrades
      ? UpdateButton.upToDate
      : UpdateButton.unknown;
  }

  // If all values are known, match comparison result with button state.
  switch (semverCompare(candidate, installedVersion)) {
    case SemverResult.RIGHT_IS_GREATER:
      return allowDowngrades
        ? UpdateButton.needsDowngrade
        : UpdateButton.upToDate;
    case SemverResult.EQUAL:
      return allowDowngrades
        ? UpdateButton.needsDowngrade
        : UpdateButton.upToDate;
    default:
      return UpdateButton.needsUpdate;
  }
};

/** Installed version equal to latest. */
const equalToLatest = (
  latest: string | undefined,
  installedVersion: string | undefined,
): boolean =>
  isString(installedVersion) && isString(latest) &&
  semverCompare(installedVersion, latest) === SemverResult.EQUAL;

interface ButtonVersionStatusProps {
  bot: BotState;
  betaOptIn: boolean;
  ignoreBot: boolean;
}

/** Color, text, and hover text for update button: release version status. */
const buttonVersionStatus =
  ({ bot, betaOptIn, ignoreBot }: ButtonVersionStatusProps): ButtonProps => {
    // Information about available releases.
    const { currentOSVersion, currentBetaOSVersion, currentBetaOSCommit } = bot;
    // Currently installed FBOS version data.
    const botInfo = bot.hardware.informational_settings;
    const {
      controller_version, commit, currently_on_beta, update_available
    } = botInfo;
    const betaSelected = !ignoreBot && betaOptIn;
    const onBeta = !ignoreBot && !!currently_on_beta;
    const upgradePathStep =
      (bot.minOsFeatureData || fallbackData)[Feature.api_ota_releases] as string;

    /** Newest release version, given settings and data available. */
    const latestVersion =
      getLatestVersion(currentOSVersion, currentBetaOSVersion, betaSelected);
    const latestReleaseV =
      adjustLatestVersion(latestVersion, upgradePathStep, ignoreBot);
    /** Installed version. */
    const installedVersion = getInstalledVersion(controller_version, onBeta);
    /** FBOS update button status. */
    const btnStatus =
      compareWithBotVersion(latestReleaseV, installedVersion, ignoreBot);

    /** Beta update special cases. */
    const uncertainty = (btnStatus === UpdateButton.upToDate) &&
      equalToLatest(latestReleaseV, installedVersion) && betaSelected;
    /** `1.0.0-beta vs 1.0.0-beta`: installed beta is older. */
    const oldBetaCommit = (latestReleaseV === currentBetaOSVersion) &&
      !betaCommitsAreEqual(commit, currentBetaOSCommit);
    /** Button status modification required for release edge cases. */
    const updateStatusOverride = !ignoreBot && update_available
      || (uncertainty && oldBetaCommit);

    return buttonProps(
      updateStatusOverride ? UpdateButton.needsUpdate : btnStatus,
      latestReleaseV);
  };

/** Shows update availability or download progress. Updates FBOS on click. */
export const OsUpdateButton = (props: OsUpdateButtonProps) => {
  const { bot, sourceFbosConfig, botOnline } = props;
  const { controller_version } = bot.hardware.informational_settings;
  const ignoreBot = props.shouldDisplay(Feature.api_ota_releases);

  /** FBOS beta release opt-in setting. */
  const betaOptIn = sourceFbosConfig("update_channel").value !== "stable";
  /** FBOS update availability. */
  const buttonStatusProps = buttonVersionStatus({ bot, betaOptIn, ignoreBot });

  /** FBOS update download progress data. */
  const osUpdateJob = (bot.hardware.jobs || {})["FBOS_OTA"];

  const tooOld = controller_version
    && (semverCompare("6.0.0", controller_version)
      === SemverResult.LEFT_IS_GREATER
      ? Content.TOO_OLD_TO_UPDATE
      : undefined);

  return <button
    className={`fb-button ${tooOld ? "yellow" : buttonStatusProps.color}`}
    title={tooOld || buttonStatusProps.hoverText}
    disabled={isWorking(osUpdateJob) || !botOnline}
    onPointerEnter={() => props.dispatch(fetchReleasesFromAPI(
      props.bot.hardware.informational_settings.target, props.shouldDisplay))}
    onClick={checkControllerUpdates}>
    {tooOld || downloadProgress(osUpdateJob) || buttonStatusProps.text}
  </button>;
};

const onError = (dispatch: Function) => {
  console.error(t("Could not download FarmBot OS update information."));
  dispatch({
    type: Actions.FETCH_OS_UPDATE_INFO_OK,
    payload: { version: undefined },
  });
};

export const fetchReleasesFromAPI =
  (target: string | undefined, shouldDisplay: ShouldDisplay) =>
    (dispatch: Function) => {
      if (!shouldDisplay(Feature.api_ota_releases)) { return; }
      const platform = target == "---" ? undefined : target;
      if (!platform) {
        console.error("Platform not available.");
        dispatch(onError);
        return;
      }
      axios
        .get<{ version: string }>(API.current.releasesPath + platform)
        .then(resp => {
          dispatch({
            type: Actions.FETCH_OS_UPDATE_INFO_OK,
            payload: { version: resp.data.version },
          });
        })
        .catch(fetchError => {
          fetchError.toString().includes("404")
            && console.error("No releases found for platform and channel.");
          console.error(fetchError);
          dispatch(onError);
        });
    };
