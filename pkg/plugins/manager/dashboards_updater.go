package manager

import (
	"github.com/grafana/grafana/pkg/bus"
	"github.com/grafana/grafana/pkg/models"
	pluginmodels "github.com/grafana/grafana/pkg/plugins/models"
)

func (pm *PluginManager) autoUpdateAppDashboard(pluginDashInfo *PluginDashboardInfoDTO, orgId int64) error {
	dash, err := pm.loadPluginDashboard(pluginDashInfo.PluginId, pluginDashInfo.Path)
	if err != nil {
		return err
	}
	pm.log.Info("Auto updating App dashboard", "dashboard", dash.Title, "newRev", pluginDashInfo.Revision, "oldRev",
		pluginDashInfo.ImportedRevision)
	updateCmd := ImportDashboardCommand{
		OrgId:     orgId,
		PluginId:  pluginDashInfo.PluginId,
		Overwrite: true,
		Dashboard: dash.Data,
		User:      &models.SignedInUser{UserId: 0, OrgRole: models.ROLE_ADMIN},
		Path:      pluginDashInfo.Path,
	}

	return bus.Dispatch(&updateCmd)
}

func (pm *PluginManager) syncPluginDashboards(pluginDef *pluginmodels.PluginBase, orgId int64) {
	pm.log.Info("Syncing plugin dashboards to DB", "pluginId", pluginDef.Id)

	// Get plugin dashboards
	dashboards, err := pm.GetPluginDashboards(orgId, pluginDef.Id)
	if err != nil {
		pm.log.Error("Failed to load app dashboards", "error", err)
		return
	}

	// Update dashboards with updated revisions
	for _, dash := range dashboards {
		// remove removed ones
		if dash.Removed {
			pm.log.Info("Deleting plugin dashboard", "pluginId", pluginDef.Id, "dashboard", dash.Slug)

			deleteCmd := models.DeleteDashboardCommand{OrgId: orgId, Id: dash.DashboardId}
			if err := bus.Dispatch(&deleteCmd); err != nil {
				pm.log.Error("Failed to auto update app dashboard", "pluginId", pluginDef.Id, "error", err)
				return
			}

			continue
		}

		// update updated ones
		if dash.ImportedRevision != dash.Revision {
			if err := pm.autoUpdateAppDashboard(dash, orgId); err != nil {
				pm.log.Error("Failed to auto update app dashboard", "pluginId", pluginDef.Id, "error", err)
				return
			}
		}
	}

	// update version in plugin_setting table to mark that we have processed the update
	query := models.GetPluginSettingByIdQuery{PluginId: pluginDef.Id, OrgId: orgId}
	if err := bus.Dispatch(&query); err != nil {
		pm.log.Error("Failed to read plugin setting by id", "error", err)
		return
	}

	appSetting := query.Result
	cmd := models.UpdatePluginSettingVersionCmd{
		OrgId:         appSetting.OrgId,
		PluginId:      appSetting.PluginId,
		PluginVersion: pluginDef.Info.Version,
	}

	if err := bus.Dispatch(&cmd); err != nil {
		pm.log.Error("Failed to update plugin setting version", "error", err)
	}
}

func (pm *PluginManager) handlePluginStateChanged(event *models.PluginStateChangedEvent) error {
	pm.log.Info("Plugin state changed", "pluginId", event.PluginId, "enabled", event.Enabled)

	if event.Enabled {
		pm.syncPluginDashboards(pm.Plugins[event.PluginId], event.OrgId)
		return nil
	}

	query := models.GetDashboardsByPluginIdQuery{PluginId: event.PluginId, OrgId: event.OrgId}
	if err := bus.Dispatch(&query); err != nil {
		return err
	}
	for _, dash := range query.Result {
		deleteCmd := models.DeleteDashboardCommand{OrgId: dash.OrgId, Id: dash.Id}

		pm.log.Info("Deleting plugin dashboard", "pluginId", event.PluginId, "dashboard", dash.Slug)

		if err := bus.Dispatch(&deleteCmd); err != nil {
			return err
		}
	}

	return nil
}
