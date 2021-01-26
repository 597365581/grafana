import React, { FC, useCallback, useMemo, useRef, useState } from 'react';
import { css, cx } from 'emotion';
import { DashboardModel, PanelModel } from '../../state';
import { GrafanaTheme, PanelData, PanelPlugin } from '@grafana/data';
import {
  Button,
  Counter,
  DataLinksInlineEditor,
  Field,
  Input,
  RadioButtonGroup,
  Select,
  stylesFactory,
  Switch,
  TagsInput,
  TextArea,
  useTheme,
} from '@grafana/ui';
import { getPanelLinksVariableSuggestions } from '../../../panel/panellinks/link_srv';
import { PanelOptionsEditor } from './PanelOptionsEditor';
import { AngularPanelOptions } from './AngularPanelOptions';
import { VisualizationTab } from './VisualizationTab';
import { OptionsGroup } from './OptionsGroup';
import { RepeatRowSelect } from '../RepeatRowSelect/RepeatRowSelect';
import { AddLibraryPanelModal } from '../AddLibraryPanelModal/AddLibraryPanelModal';
import { LibraryPanelsView } from '../LibraryPanelsView/LibraryPanelsView';
import { LibraryPanelCardProps } from '../LibraryPanelCard/LibraryPanelCard';
import { PanelQueriesChangedEvent } from 'app/types/events';

interface Props {
  panel: PanelModel;
  plugin: PanelPlugin;
  data?: PanelData;
  dashboard: DashboardModel;
  onPanelConfigChange: (configKey: string, value: any) => void;
  onPanelOptionsChanged: (options: any) => void;
}

// const addLibraryPanel = (panel: PanelModel) => () => {
//   const backendSrv = getBackendSrv();
//   backendSrv.addLibraryPanel(panel, 0).then(res => console.log(res));
// };

export const PanelOptionsTab: FC<Props> = ({
  panel,
  plugin,
  data,
  dashboard,
  onPanelConfigChange,
  onPanelOptionsChanged,
}) => {
  const theme = useTheme();
  const styles = getStyles(theme);
  const [showingAddPanelModal, setShowingAddPanelModal] = useState<boolean>(false);
  const visTabInputRef = useRef<HTMLInputElement>(null);
  const linkVariablesSuggestions = useMemo(() => getPanelLinksVariableSuggestions(), []);
  const onRepeatRowSelectChange = useCallback((value: string | null) => onPanelConfigChange('repeat', value), [
    onPanelConfigChange,
  ]);
  const elements: JSX.Element[] = [];
  const panelLinksCount = panel && panel.links ? panel.links.length : 0;

  const directionOptions = [
    { label: 'Horizontal', value: 'h' },
    { label: 'Vertical', value: 'v' },
  ];

  const maxPerRowOptions = [2, 3, 4, 6, 8, 12].map((value) => ({ label: value.toString(), value }));

  const focusVisPickerInput = (isExpanded: boolean) => {
    if (isExpanded && visTabInputRef.current) {
      visTabInputRef.current.focus();
    }
  };

  const useLibraryPanel = ({ model }: LibraryPanelCardProps) => {
    panel.restoreModel(model);

    // dummy change for re-render
    onPanelConfigChange('isEditing', true);
    panel.refresh();
    panel.events.publish(PanelQueriesChangedEvent);
  };

  const onAddToPanelLibrary = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    setShowingAddPanelModal(true);
  };

  if (panel.libraryPanel) {
    elements.push(
      <OptionsGroup title="Reusable panel information" id="Shared Panel Info" key="Shared Panel Info">
        <p className={cx(styles.libraryPanelInfo)}>
          Used on 999 dashboards <br />
          Last edited on 199X-XX-XX by LaurenIpsum
        </p>
        <Field label="Tags">
          <TagsInput onChange={() => {}} />
        </Field>
      </OptionsGroup>
    );
  }

  // First common panel settings Title, description
  elements.push(
    <OptionsGroup title="Settings" id="Panel settings" key="Panel settings">
      <Field label="Panel title">
        <Input defaultValue={panel.title} onBlur={(e) => onPanelConfigChange('title', e.currentTarget.value)} />
      </Field>
      <Field label="Description" description="Panel description supports markdown and links.">
        <TextArea
          defaultValue={panel.description}
          onBlur={(e) => onPanelConfigChange('description', e.currentTarget.value)}
        />
      </Field>
      <Field label="Transparent" description="Display panel without a background.">
        <Switch
          value={panel.transparent}
          onChange={(e) => onPanelConfigChange('transparent', e.currentTarget.checked)}
        />
      </Field>
    </OptionsGroup>
  );

  elements.push(
    <OptionsGroup title="Visualization" id="Panel type" key="Panel type" defaultToClosed onToggle={focusVisPickerInput}>
      {(toggleExpand) => <VisualizationTab panel={panel} ref={visTabInputRef} onToggleOptionGroup={toggleExpand} />}
    </OptionsGroup>
  );

  // Old legacy react editor
  if (plugin.editor && panel && !plugin.optionEditors) {
    elements.push(
      <OptionsGroup title="Options" id="legacy react editor" key="legacy react editor">
        <plugin.editor data={data} options={panel.getOptions()} onOptionsChange={onPanelOptionsChanged} />
      </OptionsGroup>
    );
  }

  if (plugin.optionEditors && panel) {
    elements.push(
      <PanelOptionsEditor
        key="panel options"
        options={panel.getOptions()}
        onChange={onPanelOptionsChanged}
        replaceVariables={panel.replaceVariables}
        plugin={plugin}
        data={data?.series}
        eventBus={dashboard.events}
      />
    );
  }

  if (plugin.angularPanelCtrl) {
    elements.push(
      <AngularPanelOptions panel={panel} dashboard={dashboard} plugin={plugin} key="angular panel options" />
    );
  }

  elements.push(
    <OptionsGroup
      renderTitle={(isExpanded) => (
        <>Links {!isExpanded && panelLinksCount > 0 && <Counter value={panelLinksCount} />}</>
      )}
      id="panel links"
      key="panel links"
      defaultToClosed
    >
      <DataLinksInlineEditor
        links={panel.links}
        onChange={(links) => onPanelConfigChange('links', links)}
        suggestions={linkVariablesSuggestions}
        data={[]}
      />
    </OptionsGroup>
  );

  elements.push(
    <OptionsGroup title="Repeat options" id="panel repeats" key="panel repeats" defaultToClosed>
      <Field
        label="Repeat by variable"
        description="Repeat this panel for each value in the selected variable.
          This is not visible while in edit mode. You need to go back to dashboard and then update the variable or
          reload the dashboard."
      >
        <RepeatRowSelect repeat={panel.repeat} onChange={onRepeatRowSelectChange} />
      </Field>
      {panel.repeat && (
        <Field label="Repeat direction">
          <RadioButtonGroup
            options={directionOptions}
            value={panel.repeatDirection || 'h'}
            onChange={(value) => onPanelConfigChange('repeatDirection', value)}
          />
        </Field>
      )}

      {panel.repeat && panel.repeatDirection === 'h' && (
        <Field label="Max per row">
          <Select
            options={maxPerRowOptions}
            value={panel.maxPerRow}
            onChange={(value) => onPanelConfigChange('maxPerRow', value.value)}
          />
        </Field>
      )}
    </OptionsGroup>
  );

  elements.push(
    <OptionsGroup
      renderTitle={(isExpanded) => {
        return isExpanded && !panel.libraryPanel ? (
          <div className={cx(styles.panelLibraryTitle)}>
            <span>Panel library</span>
            <Button size="sm" onClick={onAddToPanelLibrary}>
              Add this panel to the panel library
            </Button>
          </div>
        ) : (
          'Panel library'
        );
      }}
      id="panel-library"
      key="panel-library"
      defaultToClosed
    >
      <LibraryPanelsView formatDate={(dateString: string) => dashboard.formatDate(dateString, 'L')}>
        {(panel) => (
          <Button variant="secondary" onClick={() => useLibraryPanel(panel)}>
            Use instead of current panel
          </Button>
        )}
      </LibraryPanelsView>
      {showingAddPanelModal && (
        <AddLibraryPanelModal
          panel={panel}
          onDismiss={() => setShowingAddPanelModal(false)}
          initialFolderId={dashboard.meta.folderId}
          isOpen={showingAddPanelModal}
        />
      )}
    </OptionsGroup>
  );

  return <>{elements}</>;
};

const getStyles = stylesFactory((theme: GrafanaTheme) => {
  return {
    libraryPanelInfo: css`
      color: ${theme.colors.textSemiWeak};
      font-size: ${theme.typography.size.sm};
    `,
    panelLibraryTitle: css`
      display: flex;
      gap: 10px;
    `,
  };
});
