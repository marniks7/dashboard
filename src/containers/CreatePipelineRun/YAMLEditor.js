/*
Copyright 2022 The Tekton Authors
Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at
    http://www.apache.org/licenses/LICENSE-2.0
Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/
import { useIntl } from 'react-intl';
import {
  ALL_NAMESPACES,
  getGenerateNamePrefixForRerun,
  urls
} from '@tektoncd/dashboard-utils';
import {
  Button,
  Form,
  FormGroup,
  InlineNotification
} from 'carbon-components-react';
import yaml from 'js-yaml';
import React, { useState } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { StreamLanguage } from '@codemirror/language';
import { yaml as codeMirrorYAML } from '@codemirror/legacy-modes/mode/yaml';
import { useLocation, useNavigate } from 'react-router-dom-v5-compat';
import deepClone from 'lodash.clonedeep';
import {
  createPipelineRunRaw,
  usePipelineRun,
  useSelectedNamespace
} from '../../api';

export function generateNewPipelineRun(pipelineRun) {
  const pipelineRunObj = deepClone(pipelineRun);
  const { labels, annotations, namespace } = pipelineRunObj.metadata;

  if (!pipelineRunObj.metadata.generateName) {
    pipelineRunObj.metadata.generateName = getGenerateNamePrefixForRerun(
      pipelineRunObj.metadata.name
    );
  }
  if (pipelineRunObj.metadata.annotations) {
    delete pipelineRunObj.metadata.annotations[
      'kubectl.kubernetes.io/last-applied-configuration'
    ];
  }
  pipelineRunObj.metadata = {
    annotations,
    labels,
    namespace,
    generateName: pipelineRunObj.metadata.generateName
  };
  Object.keys(pipelineRunObj.metadata).forEach(
    i =>
      pipelineRunObj.metadata[i] === undefined &&
      delete pipelineRunObj.metadata[i]
  );

  if (pipelineRunObj.status) {
    delete pipelineRunObj.status;
  }

  return yaml.safeDump(pipelineRunObj);
}

export function CreateYAMLEditor({ code: initialCode = '' }) {
  const intl = useIntl();
  const navigate = useNavigate();
  const location = useLocation();
  const { selectedNamespace } = useSelectedNamespace();

  function getPipelineRunName() {
    const urlSearchParams = new URLSearchParams(location.search);
    return urlSearchParams.get('pipelineRunName') || '';
  }

  function getNamespace() {
    const urlSearchParams = new URLSearchParams(location.search);
    return (
      urlSearchParams.get('namespace') ||
      (selectedNamespace !== ALL_NAMESPACES ? selectedNamespace : '')
    );
  }

  const [
    {
      isCreating,
      submitError,
      validationErrorMessage,
      pipelineRunName,
      pipelineRunNamespace
    },
    setState
  ] = useState({
    isCreating: false,
    submitError: '',
    validationErrorMessage: '',
    pipelineRunNamespace: getNamespace(),
    pipelineRunName: getPipelineRunName()
  });

  const { data: pipelineRunObj } = usePipelineRun(
    {
      name: pipelineRunName,
      namespace: pipelineRunNamespace
    },
    { enabled: !!pipelineRunName }
  );

  let code;
  if (pipelineRunObj) {
    code = generateNewPipelineRun(pipelineRunObj);
  } else {
    code = initialCode;
  }

  function validateNamespace(obj) {
    if (!obj?.metadata?.namespace) {
      return {
        valid: false,
        message: intl.formatMessage({
          id: 'dashboard.createRun.invalidNamespace',
          defaultMessage: 'Namespace cannot be empty'
        })
      };
    }
    return null;
  }

  function validateEmptyYaml() {
    if (!code) {
      return {
        valid: false,
        message: intl.formatMessage({
          id: 'dashboard.createPipelineRun.empty',
          defaultMessage: 'PipelineRun cannot be empty'
        })
      };
    }
    return null;
  }

  function handleSubmit(event) {
    event.preventDefault();
    // Check form validation
    let validationResult = validateEmptyYaml();
    if (validationResult && !validationResult.valid) {
      setState(state => ({
        ...state,
        validationErrorMessage: validationResult.message
      }));
      return;
    }

    let pipelineRun;
    try {
      pipelineRun = yaml.load(code);
    } catch (e) {
      setState(state => ({
        ...state,
        validationErrorMessage: e.message
      }));
      return;
    }

    validationResult = validateNamespace(pipelineRun);
    if (validationResult && !validationResult.valid) {
      setState(state => ({
        ...state,
        validationErrorMessage: validationResult.message
      }));
      return;
    }

    setState(state => ({ ...state, isCreating: true }));
    const namespace = pipelineRun?.metadata?.namespace;

    createPipelineRunRaw({
      namespace,
      payload: pipelineRun
    })
      .then(() => {
        navigate(urls.pipelineRuns.byNamespace({ namespace }));
      })
      .catch(error => {
        error.response.text().then(text => {
          const statusCode = error.response.status;
          let errorMessage = `error code ${statusCode}`;
          if (text) {
            errorMessage = `${text} (error code ${statusCode})`;
          }
          setState(state => ({
            ...state,
            isCreating: false,
            submitError: errorMessage
          }));
        });
      });
  }

  function onChange(newValue, _viewUpdate) {
    code = newValue;
  }

  function resetError() {
    setState(state => ({ ...state, submitError: '' }));
  }

  function handleClose() {
    let url = urls.pipelineRuns.all();
    if (selectedNamespace && selectedNamespace !== ALL_NAMESPACES) {
      url = urls.pipelineRuns.byNamespace({ namespace: selectedNamespace });
    }
    navigate(url);
  }

  return (
    <div className="tkn--create">
      <div className="tkn--create--heading">
        <h1 id="main-content-header">
          {intl.formatMessage({
            id: 'dashboard.createPipelineRun.title',
            defaultMessage: 'Create PipelineRun'
          })}
        </h1>
      </div>
      <Form>
        {validationErrorMessage && (
          <InlineNotification
            kind="error"
            title={intl.formatMessage({
              id: 'dashboard.createRun.yaml.validationError',
              defaultMessage: 'Please fix errors, then resubmit'
            })}
            subtitle={validationErrorMessage}
            lowContrast
          />
        )}
        {submitError && (
          <InlineNotification
            kind="error"
            title={intl.formatMessage({
              id: 'dashboard.createPipelineRun.createError',
              defaultMessage: 'Error creating PipelineRun'
            })}
            subtitle={submitError}
            onCloseButtonClick={resetError}
            lowContrast
          />
        )}
        <FormGroup legendText="">
          <CodeMirror
            value={code}
            height="800px"
            theme="dark"
            extensions={[StreamLanguage.define(codeMirrorYAML)]}
            onChange={onChange}
          />
        </FormGroup>
        <Button
          iconDescription={intl.formatMessage({
            id: 'dashboard.actions.createButton',
            defaultMessage: 'Create'
          })}
          onClick={handleSubmit}
          disabled={isCreating}
        >
          {intl.formatMessage({
            id: 'dashboard.actions.createButton',
            defaultMessage: 'Create'
          })}
        </Button>
        <Button
          iconDescription={intl.formatMessage({
            id: 'dashboard.modal.cancelButton',
            defaultMessage: 'Cancel'
          })}
          kind="secondary"
          onClick={handleClose}
          disabled={isCreating}
        >
          {intl.formatMessage({
            id: 'dashboard.modal.cancelButton',
            defaultMessage: 'Cancel'
          })}
        </Button>
      </Form>
    </div>
  );
}
