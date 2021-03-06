import React from "react";
import { StepParams, FarmwareData } from "../interfaces";
import { ToolTips, Content } from "../../constants";
import { StepInputBox } from "../inputs/step_input_box";
import { StepWrapper, StepWarning } from "../step_ui";
import { Row, Col, FBSelect, DropDownItem } from "../../ui/index";
import { editStep } from "../../api/crud";
import { ExecuteScript, FarmwareConfig } from "farmbot";
import { FarmwareInputs, farmwareList } from "./tile_execute_script_support";
import { t } from "../../i18next_wrapper";
import { Link } from "../../link";

export const TileExecuteScript = (props: StepParams<ExecuteScript>) => {
  const {
    dispatch, currentStep, index, currentSequence, farmwareData,
  } = props;

  const farmwareName = currentStep.args.label;

  /** Selected Farmware is installed on connected bot. */
  const isInstalled = (n: string): boolean => {
    return !!(farmwareData && farmwareData.farmwareNames.includes(n));
  };

  const selectedFarmwareDDI = (n: string): DropDownItem => {
    if (isInstalled(n)) { return { value: n, label: n }; }
    return { label: t("Manual Input"), value: "" };
  };

  /** dispatch editStep for current ExecuteScript step */
  const updateStep = (executor: (stepCopy: ExecuteScript) => void) => {
    dispatch(editStep({
      sequence: currentSequence,
      step: currentStep,
      index: index,
      executor
    }));
  };

  /** Change step Farmware name. */
  const updateStepFarmwareSelection = (item: DropDownItem) => {
    updateStep((step: ExecuteScript) => {
      if (step.body && (step.args.label !== "" + item.value)) {
        // Clear step body when switching to a different Farmware
        delete step.body;
      }
      step.args.label = "" + item.value;
    });
  };

  /** Configs (inputs) from Farmware manifest for <FarmwareInputs />. */
  const currentFarmwareConfigDefaults = (fwName: string): FarmwareConfig[] => {
    return farmwareData?.farmwareConfigs[fwName]
      ? farmwareData.farmwareConfigs[fwName]
      : [];
  };

  return <StepWrapper
    className={"execute-script-step"}
    helpText={farmwareName == "plant-detection"
      ? ToolTips.DETECT_WEEDS
      : ToolTips.EXECUTE_SCRIPT}
    currentSequence={currentSequence}
    currentStep={currentStep}
    dispatch={dispatch}
    index={index}
    resources={props.resources}
    warning={<DetectWeedsStepWarnings farmwareName={farmwareName}
      farmwareData={farmwareData} />}>
    <Row>
      {farmwareName == "plant-detection"
        ? <DetectWeedsStep />
        : <Col xs={12}>
          <label>{t("Package Name")}</label>
          <FBSelect
            key={JSON.stringify(currentSequence)}
            list={farmwareList(farmwareData)}
            selectedItem={selectedFarmwareDDI(farmwareName)}
            onChange={updateStepFarmwareSelection}
            allowEmpty={true}
            customNullLabel={t("Manual Input")} />
          {!isInstalled(farmwareName) &&
            <div className="farmware-name-manual-input">
              <label>{t("Manual input")}</label>
              <StepInputBox dispatch={dispatch}
                index={index}
                step={currentStep}
                sequence={currentSequence}
                field="label" />
            </div>}
          <FarmwareInputs
            farmwareName={farmwareName}
            farmwareInstalled={isInstalled(farmwareName)}
            defaultConfigs={currentFarmwareConfigDefaults(farmwareName)}
            currentStep={currentStep}
            updateStep={updateStep} />
        </Col>}
    </Row>
  </StepWrapper>;
};

const DetectWeedsStep = () =>
  <Col xs={12}>
    <p>
      {`${t("Results are viewable from the")} `}
      <Link to={"/app/designer/photos"}>
        {t("photos panel")}
      </Link>.
    </p>
  </Col>;

interface DetectWeedsStepWarningsProps {
  farmwareName: string;
  farmwareData: FarmwareData | undefined;
}

const DetectWeedsStepWarnings = (props: DetectWeedsStepWarningsProps) => {
  if (props.farmwareData && props.farmwareName === "plant-detection") {
    if (props.farmwareData.cameraDisabled) {
      return <StepWarning
        titleBase={t(Content.NO_CAMERA_SELECTED)}
        warning={t(ToolTips.SELECT_A_CAMERA)} />;
    }
    if (!props.farmwareData.cameraCalibrated) {
      return <StepWarning
        titleBase={t(Content.CAMERA_NOT_CALIBRATED)}
        warning={t(ToolTips.CALIBRATION_REQUIRED)} />;
    }
  }
  return <div className={"no-warnings"} />;
};
