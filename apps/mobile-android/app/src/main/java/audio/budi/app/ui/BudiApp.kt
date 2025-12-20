package audio.budi.app.ui

import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Folder
import androidx.compose.material.icons.filled.GraphicEq
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.navigation.NavDestination.Companion.hierarchy
import androidx.navigation.NavGraph.Companion.findStartDestination
import androidx.navigation.compose.*
import audio.budi.app.ui.screens.*

sealed class Screen(val route: String, val title: String, val icon: @Composable () -> Unit) {
    object Projects : Screen("projects", "Projects", { Icon(Icons.Default.Folder, "Projects") })
    object Processing : Screen("processing", "Processing", { Icon(Icons.Default.GraphicEq, "Processing") })
    object Settings : Screen("settings", "Settings", { Icon(Icons.Default.Settings, "Settings") })
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun BudiApp(
    viewModel: AuthViewModel = hiltViewModel()
) {
    val isAuthenticated by viewModel.isAuthenticated.collectAsState()

    if (!isAuthenticated) {
        AuthScreen(viewModel)
    } else {
        val navController = rememberNavController()
        val items = listOf(Screen.Projects, Screen.Processing, Screen.Settings)

        Scaffold(
            bottomBar = {
                NavigationBar {
                    val navBackStackEntry by navController.currentBackStackEntryAsState()
                    val currentDestination = navBackStackEntry?.destination

                    items.forEach { screen ->
                        NavigationBarItem(
                            icon = screen.icon,
                            label = { Text(screen.title) },
                            selected = currentDestination?.hierarchy?.any { it.route == screen.route } == true,
                            onClick = {
                                navController.navigate(screen.route) {
                                    popUpTo(navController.graph.findStartDestination().id) {
                                        saveState = true
                                    }
                                    launchSingleTop = true
                                    restoreState = true
                                }
                            }
                        )
                    }
                }
            }
        ) { innerPadding ->
            NavHost(
                navController = navController,
                startDestination = Screen.Projects.route,
                modifier = Modifier.padding(innerPadding)
            ) {
                composable(Screen.Projects.route) {
                    ProjectsScreen(
                        onProjectClick = { projectId ->
                            navController.navigate("project/$projectId")
                        }
                    )
                }
                composable(Screen.Processing.route) {
                    ProcessingScreen()
                }
                composable(Screen.Settings.route) {
                    SettingsScreen(onLogout = viewModel::logout)
                }
                composable("project/{projectId}") { backStackEntry ->
                    val projectId = backStackEntry.arguments?.getString("projectId") ?: return@composable
                    ProjectDetailScreen(
                        projectId = projectId,
                        onBack = { navController.popBackStack() }
                    )
                }
            }
        }
    }
}
