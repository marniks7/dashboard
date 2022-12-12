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

import React from 'react';

import { fireEvent, waitFor } from '@testing-library/react';
import { renderWithRouter } from '../../utils/test';
import { CreateYAMLEditor, generateNewPipelineRun } from './YAMLEditor';
import * as PipelineRunsAPI from '../../api/pipelineRuns';

const submitButton = allByText => allByText('Create')[0];
const pipelineRun = `
      apiVersion: tekton.dev/v1beta1
      kind: PipelineRun
      metadata:
        name: test-pipeline-run-name
        namespace: test-namespace
      spec:
        pipelineSpec:
          tasks:
            - name: hello
              taskSpec:
                steps:
                  - name: echo
                    image: busybox
                    script: |
                      #!/bin/ash
                      echo "Hello World!"
    `;

const pipelineRunWithoutNamespace = `
      apiVersion: tekton.dev/v1beta1
      kind: PipelineRun
      metadata:
        name: test-pipeline-run-name
      spec:
        pipelineSpec:
          tasks:
            - name: hello
              taskSpec:
                steps:
                  - name: echo
                    image: busybox
                    script: |
                      #!/bin/ash
                      echo "Hello World!"
    `;

const pipelineRunIncorrectYaml = `a: b
dddd;a`;

const pipelineRunRaw = {
  apiVersion: 'tekton.dev/v1beta1',
  kind: 'PipelineRun',
  metadata: { name: 'test-pipeline-run-name', namespace: 'test-namespace' },
  spec: {
    pipelineSpec: {
      tasks: [
        {
          name: 'hello',
          taskSpec: {
            steps: [
              {
                image: 'busybox',
                name: 'echo',
                script: '#!/bin/ash\necho "Hello World!"\n'
              }
            ]
          }
        }
      ]
    }
  }
};

const pipelineRunRawGenerateName = {
  apiVersion: 'tekton.dev/v1beta1',
  kind: 'PipelineRun',
  metadata: {
    generateName: 'test-pipeline-run-name',
    namespace: 'test-namespace'
  },
  spec: {
    pipelineSpec: {
      tasks: [
        {
          name: 'hello',
          taskSpec: {
            steps: [
              {
                image: 'busybox',
                name: 'echo',
                script: '#!/bin/ash\necho "Hello World!"\n'
              }
            ]
          }
        }
      ]
    }
  }
};

describe('YAMLEditor', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(window.history, 'pushState');
    // Workaround for codemirror vs jsdom https://github.com/jsdom/jsdom/issues/3002#issuecomment-1118039915
    // for textRange(...).getClientRects is not a function
    Range.prototype.getBoundingClientRect = () => ({
      bottom: 0,
      height: 0,
      left: 0,
      right: 0,
      top: 0,
      width: 0
    });
    Range.prototype.getClientRects = () => ({
      item: () => null,
      length: 0,
      [Symbol.iterator]: jest.fn()
    });
  });
  it('handles onClose event', () => {
    const { getByText } = renderWithRouter(<CreateYAMLEditor />);
    fireEvent.click(getByText(/cancel/i));
    // will be called once for render (from test utils) and once for navigation
    expect(window.history.pushState).toHaveBeenCalledTimes(2);
  });

  it('handle submit pipelinerun with empty pipelinerun', () => {
    const { queryAllByText, getByRole, getByText } = renderWithRouter(
      <CreateYAMLEditor />
    );
    expect(getByRole(/textbox/)).toBeTruthy();

    expect(submitButton(queryAllByText)).toBeTruthy();

    fireEvent.click(submitButton(queryAllByText));
    expect(getByText(/Please fix errors, then resubmit/)).toBeTruthy();
    expect(getByText('PipelineRun cannot be empty')).toBeTruthy();
  });

  it('handle submit pipelinerun without namespace', () => {
    const { queryAllByText, getByRole, getByText } = renderWithRouter(
      <CreateYAMLEditor />
    );

    fireEvent.paste(getByRole(/textbox/), {
      target: { textContent: pipelineRunWithoutNamespace }
    });

    expect(submitButton(queryAllByText)).toBeTruthy();

    fireEvent.click(submitButton(queryAllByText));
    expect(getByText(/Please fix errors, then resubmit/)).toBeTruthy();
    expect(getByText('Namespace cannot be empty')).toBeTruthy();
  });

  it('handle submit pipelinerun incorrect yaml', () => {
    const { queryAllByText, getByRole, getByText } = renderWithRouter(
      <CreateYAMLEditor />
    );

    fireEvent.paste(getByRole(/textbox/), {
      target: { textContent: pipelineRunIncorrectYaml }
    });

    expect(submitButton(queryAllByText)).toBeTruthy();

    fireEvent.click(submitButton(queryAllByText));
    expect(getByText(/Please fix errors, then resubmit/)).toBeTruthy();
    expect(getByText(/can not read a block mapping entry/)).toBeTruthy();
  });

  it('handle submit pipelinerun', async () => {
    jest
      .spyOn(PipelineRunsAPI, 'createPipelineRunRaw')
      .mockImplementation(() => Promise.resolve({ data: {} }));
    const { queryAllByText, getByText, getByRole } = renderWithRouter(
      <CreateYAMLEditor />
    );
    fireEvent.paste(getByRole(/textbox/), {
      target: { textContent: pipelineRun }
    });
    await waitFor(() => {
      expect(getByText(/test-namespace/)).toBeTruthy();
    });

    fireEvent.click(submitButton(queryAllByText));

    await waitFor(() => {
      expect(PipelineRunsAPI.createPipelineRunRaw).toHaveBeenCalledTimes(1);
    });
    expect(PipelineRunsAPI.createPipelineRunRaw).toHaveBeenCalledWith(
      expect.objectContaining({
        namespace: 'test-namespace',
        payload: pipelineRunRaw
      })
    );
    await waitFor(() => {
      expect(window.history.pushState).toHaveBeenCalledTimes(2);
    });
  });

  it('handle submit pipelinerun when error', async () => {
    const errorResponseMock = {
      response: { status: 404, text: () => Promise.resolve('Whoops!') }
    };
    jest
      .spyOn(PipelineRunsAPI, 'createPipelineRunRaw')
      .mockImplementation(() => Promise.reject(errorResponseMock));
    const { queryAllByText, getByText, getByRole } = renderWithRouter(
      <CreateYAMLEditor />
    );
    fireEvent.paste(getByRole(/textbox/), {
      target: { textContent: pipelineRun }
    });
    await waitFor(() => {
      expect(getByText(/test-namespace/)).toBeTruthy();
    });

    fireEvent.click(submitButton(queryAllByText));

    await waitFor(() => {
      expect(getByText(/Whoops!/)).toBeTruthy();
    });
    await waitFor(() => {
      expect(getByText(/Error creating PipelineRun/)).toBeTruthy();
    });
  });
});

describe('YAML. Edit and Run', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(window.history, 'pushState');
    // Workaround for codemirror vs jsdom https://github.com/jsdom/jsdom/issues/3002#issuecomment-1118039915
    // for textRange(...).getClientRects is not a function
    Range.prototype.getBoundingClientRect = () => ({
      bottom: 0,
      height: 0,
      left: 0,
      right: 0,
      top: 0,
      width: 0
    });
    Range.prototype.getClientRects = () => ({
      item: () => null,
      length: 0,
      [Symbol.iterator]: jest.fn()
    });
  });
  it('handle submit pipelinerun input pipelinerun', async () => {
    jest
      .spyOn(PipelineRunsAPI, 'createPipelineRunRaw')
      .mockImplementation(() => Promise.resolve({ data: {} }));
    jest
      .spyOn(PipelineRunsAPI, 'usePipelineRun')
      .mockImplementation(() => ({ data: pipelineRunRawGenerateName }));

    const { queryAllByText } = renderWithRouter(<CreateYAMLEditor />);

    expect(submitButton(queryAllByText)).toBeTruthy();

    fireEvent.click(submitButton(queryAllByText));

    await waitFor(() => {
      expect(PipelineRunsAPI.createPipelineRunRaw).toHaveBeenCalledTimes(1);
    });
    expect(PipelineRunsAPI.createPipelineRunRaw).toHaveBeenCalledWith(
      expect.objectContaining({
        namespace: 'test-namespace',
        payload: pipelineRunRawGenerateName
      })
    );
    await waitFor(() => {
      expect(window.history.pushState).toHaveBeenCalledTimes(2);
    });
  });
  it('generate new pipeline run minimum', () => {
    const pr = {
      apiVersion: 'tekton.dev/v1beta1',
      kind: 'PipelineRun',
      metadata: {
        name: 'test',
        namespace: 'test2'
      },
      spec: {
        pipelineRef: {
          name: 'simple'
        }
      }
    };
    const actual = generateNewPipelineRun(pr);
    const expected = `apiVersion: tekton.dev/v1beta1
kind: PipelineRun
metadata:
  namespace: test2
  generateName: test-r-
spec:
  pipelineRef:
    name: simple
`;
    expect(actual).toEqual(expected);
  });
  it('generate new pipeline run maximum', () => {
    const pr = {
      apiVersion: 'tekton.dev/v1beta1',
      kind: 'PipelineRun',
      metadata: {
        annotations: {
          keya: 'valuea',
          'kubectl.kubernetes.io/last-applied-configuration': {
            keya: 'valuea'
          }
        },
        labels: {
          keyl: 'valuel',
          key2: 'value2'
        },
        name: 'test',
        namespace: 'test2',
        uid: '111-233-33',
        resourceVersion: 'aaaa'
      },
      spec: {
        pipelineRef: {
          name: 'simple'
        },
        params: [{ name: 'param-1' }, { name: 'param-2' }]
      },
      status: { startTime: '0' }
    };
    const actual = generateNewPipelineRun(pr);
    const expected = `apiVersion: tekton.dev/v1beta1
kind: PipelineRun
metadata:
  annotations:
    keya: valuea
  labels:
    keyl: valuel
    key2: value2
  namespace: test2
  generateName: test-r-
spec:
  pipelineRef:
    name: simple
  params:
    - name: param-1
    - name: param-2
`;
    expect(actual).toEqual(expected);
  });
  it('generate new pipeline run last applied configuration should be removed', () => {
    const pr = {
      apiVersion: 'tekton.dev/v1beta1',
      kind: 'PipelineRun',
      metadata: {
        annotations: {
          'kubectl.kubernetes.io/last-applied-configuration': {
            keya: 'valuea'
          }
        },
        name: 'test',
        namespace: 'test2'
      },
      spec: {
        pipelineRef: {
          name: 'simple'
        }
      }
    };
    const actual = generateNewPipelineRun(pr);
    const expected = `apiVersion: tekton.dev/v1beta1
kind: PipelineRun
metadata:
  annotations: {}
  namespace: test2
  generateName: test-r-
spec:
  pipelineRef:
    name: simple
`;
    expect(actual).toEqual(expected);
  });
});
