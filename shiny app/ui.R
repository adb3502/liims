library(shiny)
library(shinydashboard)
library(DT)
library(plotly)
library(shinyWidgets)
library(wesanderson)
library(shinycssloaders)

ui <- dashboardPage(
  skin = "blue",
  dashboardHeader(
    title = "BHARAT Data Dashboard"
  ),

  dashboardSidebar(
    width = 250,
    sidebarMenu(
      id = "sidebar",
      menuItem("Data Summary", tabName = "data_summary"),
      menuItem("Parameter Distribution", tabName = "exploration"),
      menuItem("Correlation Analysis", tabName = "correlation"),
      menuItem("Multivariable Analysis", tabName = "multivariable"),
      menuItem("PCA Analysis", tabName = "pca"),
      menuItem("Immune Phenotyping", tabName = "immune_phenotyping")
    )
  ),

  dashboardBody(
    tags$head(
      tags$script(HTML("
        // Handle iframe updates from server
        Shiny.addCustomMessageHandler('updateIframe', function(jsCode) {
          setTimeout(function() {
            eval(jsCode);
          }, 500); // Small delay to ensure iframe is loaded
        });
      ")),
      tags$style(HTML("
        /* Main background and styling */
        .content-wrapper, .right-side {
          background: linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%);
        }

        /* Box styling with subtle shadows */
        .box {
          border-radius: 10px;
          box-shadow: 0 4px 8px rgba(0,0,0,0.1);
          border-top: 3px solid #3c8dbc;
          margin-bottom: 20px;
        }

        /* Value box improvements */
        .small-box {
          border-radius: 10px;
          box-shadow: 0 4px 8px rgba(0,0,0,0.1);
        }
        .small-box h3 {
          font-size: 2.2em;
          font-weight: bold;
        }

        /* Sidebar improvements */
        .sidebar {
          background: linear-gradient(180deg, #2c3e50 0%, #3498db 100%);
        }

        /* Button styling */
        .btn-primary {
          background: linear-gradient(45deg, #3498db, #2ecc71);
          border: none;
          border-radius: 5px;
          font-weight: bold;
        }
        .btn-primary:hover {
          background: linear-gradient(45deg, #2980b9, #27ae60);
        }

        /* Tab content spacing */
        .tab-content {
          padding-top: 10px;
        }

        /* Custom input styling */
        .form-control {
          border-radius: 5px;
          border: 1px solid #ddd;
        }

        /* Plot containers */
        .plotly {
          border-radius: 8px;
        }
      "))
    ),

    tabItems(
      # Tab 1: Data Summary (replaces Data Loading & Distribution Analysis)
      tabItem(tabName = "data_summary",
        fluidRow(
          valueBoxOutput("totalParticipants"),
          valueBoxOutput("totalMales"),
          valueBoxOutput("totalFemales")
        ),

        fluidRow(
          box(
            title = "Age Group Distribution", status = "primary", solidHeader = TRUE, width = 6,
            plotlyOutput("ageGroupPlot")
          ),

          box(
            title = "Gender Distribution", status = "primary", solidHeader = TRUE, width = 6,
            plotlyOutput("genderPlot")
          )
        ),

        fluidRow(
          box(
            title = "Provider Distribution", status = "info", solidHeader = TRUE, width = 6,
            plotlyOutput("providerPlot")
          ),

          box(
            title = "Age Group × Gender Distribution", status = "info", solidHeader = TRUE, width = 6,
            plotlyOutput("ageGenderPlot")
          )
        ),

        fluidRow(
          box(
            title = "Urban/Rural Distribution", status = "info", solidHeader = TRUE, width = 6,
            plotlyOutput("urbanRuralPlot")
          ),

          box(
            title = "Centre Distribution", status = "info", solidHeader = TRUE, width = 6,
            plotlyOutput("centrePlot")
          )
        ),

        fluidRow(
          box(
            title = "HbA1c Categories", status = "warning", solidHeader = TRUE, width = 6,
            plotlyOutput("hba1cCategoryPlot")
          ),

          box(
            title = "Summary Statistics", status = "success", solidHeader = TRUE, width = 6,
            DT::dataTableOutput("summaryStats")
          )
        ),

        fluidRow(
          box(
            title = "Data Preview", status = "info", solidHeader = TRUE, width = 12, collapsible = TRUE,
            verbatimTextOutput("uploadStatus"),
            br(),
            DT::dataTableOutput("dataPreview")
          )
        )
      ),

      # Tab 2: Parameter Distribution (consolidates exploration + regression)
      tabItem(tabName = "exploration",
        fluidRow(
          box(
            title = "Cohort & Parameter Selection", status = "info", solidHeader = TRUE, width = 3,
            h5("Filter Cohort:"),
            checkboxGroupInput("explorationAgeGroupFilter", "Age Groups:",
                              choices = list("18-29" = "18-29 years",
                                           "30-44" = "30-44 years",
                                           "45-59" = "45-59 years",
                                           "60-74" = "60-74 years",
                                           "75+" = "75+ years"),
                              selected = c("18-29 years", "30-44 years", "45-59 years", "60-74 years", "75+ years")),

            checkboxGroupInput("explorationGenderFilter", "Gender:",
                              choices = list("Male" = "Male", "Female" = "Female"),
                              selected = c("Male", "Female")),

            checkboxGroupInput("explorationHba1cFilter", "HbA1c Status:",
                              choices = list("Normal" = "Normal",
                                           "Prediabetic" = "Prediabetic",
                                           "Diabetic" = "Diabetic"),
                              selected = c("Normal", "Prediabetic", "Diabetic")),

            checkboxGroupInput("explorationProviderFilter", "Provider:",
                              choices = NULL,
                              selected = NULL),

            checkboxGroupInput("explorationParameterType", "Parameter Type:",
                              choices = list("Blood Biochemistry" = "blood",
                                           "Immune Phenotyping" = "immune"),
                              selected = c("blood", "immune")),

            conditionalPanel(
              condition = "input.explorationParameterType.includes('immune')",
              checkboxGroupInput("explorationImmuneCellType", "Immune Cell Types:",
                                choices = list("T Cells" = "tcell",
                                             "B Cells" = "bcell",
                                             "Dendritic Cells" = "dendritic",
                                             "Granulocytes" = "granulocyte"),
                                selected = c("tcell", "bcell", "dendritic", "granulocyte"))
            ),

            actionButton("applyExplorationFilters", "Apply Filters", class = "btn-info"),
            br(),br(),
            verbatimTextOutput("explorationCohortSummary")
          ),

          tabBox(
            width = 9,
            tabPanel(
              "Distribution",
              fluidRow(
                column(4,
                  box(
                    title = "Plot Configuration", status = "primary", solidHeader = TRUE, width = 12,
                    selectInput("column", "Select Column:",
                               choices = NULL),

                    radioButtons("plotType", "Plot Type:",
                                choices = list("Box Plot" = "box",
                                             "Violin Plot" = "violin",
                                             "Histogram" = "histogram",
                                             "Density Plot" = "density")),

                    selectInput("colorBy", "Color By:",
                               choices = list("None" = "none",
                                            "Age Group" = "age_group_label",
                                            "Gender" = "gender_label",
                                            "HbA1c Category" = "hba1c_category",
                                            "Provider" = "Provider")),

                    selectInput("groupBy", "Group By:",
                               choices = list("None" = "none",
                                            "Age Group" = "age_group_label",
                                            "Gender" = "gender_label",
                                            "Provider" = "Provider",
                                            "Age × Gender" = "age_gender",
                                            "Custom Groups" = "custom")),

                    conditionalPanel(
                      condition = "input.groupBy == 'custom'",
                      h5("Custom Age Groups:"),
                      checkboxGroupInput("customGroups", "",
                                       choices = list("Young (18-29)" = "1",
                                                    "Adult (30-44)" = "2",
                                                    "Middle-aged (45-59)" = "3",
                                                    "Senior (60-74)" = "4",
                                                    "Elderly (75+)" = "5"))
                    ),

                    checkboxInput("showPoints", "Show Points", value = FALSE),

                    checkboxInput("removeOutliers", "Remove Outliers", value = FALSE),

                    selectInput("colorScheme", "Color Scheme:",
                               choices = list("Wes Anderson - Royal Tenenbaums" = "Royal1",
                                            "Wes Anderson - Moonrise Kingdom" = "Moonrise3",
                                            "Wes Anderson - Grand Budapest" = "GrandBudapest1",
                                            "Wes Anderson - Darjeeling Limited" = "Darjeeling1",
                                            "Wes Anderson - Rushmore" = "Rushmore1",
                                            "Wes Anderson - Bottle Rocket" = "BottleRocket2",
                                            "Classic - Set1" = "Set1",
                                            "Classic - Dark2" = "Dark2",
                                            "Viridis" = "viridis",
                                            "Plasma" = "plasma"))
                  )
                ),
                column(8,
                  withSpinner(
                    plotlyOutput("explorationPlot", height = "600px"),
                    type = 4, color = "#3c8dbc"
                  )
                )
              ),
              fluidRow(
                box(
                  title = "Variable Statistics", status = "info", solidHeader = TRUE, width = 12,
                  verbatimTextOutput("variableStats")
                )
              )
            ),

            tabPanel(
              "Regression",
              fluidRow(
                column(4,
                  box(
                    title = "Variable Selection", status = "primary", solidHeader = TRUE, width = 12,
                    selectInput("xVariable", "X Variable:",
                               choices = NULL),

                    selectInput("yVariable", "Y Variable:",
                               choices = NULL),

                    selectInput("regressionColorBy", "Color By:",
                               choices = list("None" = "none",
                                            "Age Group" = "age_group_label",
                                            "Gender" = "gender_label",
                                            "HbA1c Category" = "hba1c_category",
                                            "Provider" = "Provider",
                                            "Continuous" = "continuous")),

                    conditionalPanel(
                      condition = "input.regressionColorBy == 'continuous'",
                      selectInput("continuousColor", "Continuous Variable:",
                                 choices = NULL)
                    ),

                    checkboxInput("showRegression", "Show Regression Line", value = TRUE),

                    radioButtons("regressionType", "Regression Type:",
                                choices = list("Linear" = "lm",
                                             "LOESS" = "loess",
                                             "Polynomial" = "poly")),

                    conditionalPanel(
                      condition = "input.regressionType == 'poly'",
                      numericInput("polyDegree", "Polynomial Degree:", value = 2, min = 2, max = 5)
                    )
                  )
                ),
                column(8,
                  withSpinner(
                    plotlyOutput("scatterPlot", height = "600px"),
                    type = 4, color = "#3c8dbc"
                  )
                )
              ),
              fluidRow(
                box(
                  title = "Correlation Analysis", status = "info", solidHeader = TRUE, width = 6,
                  verbatimTextOutput("correlationStats")
                ),
                box(
                  title = "Regression Summary", status = "warning", solidHeader = TRUE, width = 6,
                  verbatimTextOutput("regressionSummary")
                )
              )
            )
          )
        )
      ),

      # Tab 3: Correlation Analysis
      tabItem(tabName = "correlation",
        fluidRow(
          box(
            title = "Cohort & Parameter Selection", status = "info", solidHeader = TRUE, width = 4,
            h5("Filter Cohort:"),
            checkboxGroupInput("correlationAgeGroupFilter", "Age Groups:",
                              choices = list("18-29" = "18-29 years",
                                           "30-44" = "30-44 years",
                                           "45-59" = "45-59 years",
                                           "60-74" = "60-74 years",
                                           "75+" = "75+ years"),
                              selected = c("18-29 years", "30-44 years", "45-59 years", "60-74 years", "75+ years")),

            checkboxGroupInput("correlationGenderFilter", "Gender:",
                              choices = list("Male" = "Male", "Female" = "Female"),
                              selected = c("Male", "Female")),

            checkboxGroupInput("correlationHba1cFilter", "HbA1c Status:",
                              choices = list("Normal" = "Normal",
                                           "Prediabetic" = "Prediabetic",
                                           "Diabetic" = "Diabetic"),
                              selected = c("Normal", "Prediabetic", "Diabetic")),

            checkboxGroupInput("correlationProviderFilter", "Provider:",
                              choices = NULL,
                              selected = NULL),

            checkboxGroupInput("correlationParameterType", "Parameter Type:",
                              choices = list("Blood Biochemistry" = "blood",
                                           "Immune Phenotyping" = "immune"),
                              selected = c("blood", "immune")),

            conditionalPanel(
              condition = "input.correlationParameterType.includes('immune')",
              checkboxGroupInput("correlationImmuneCellType", "Immune Cell Types:",
                                choices = list("T Cells" = "tcell",
                                             "B Cells" = "bcell",
                                             "Dendritic Cells" = "dendritic",
                                             "Granulocytes" = "granulocyte"),
                                selected = c("tcell", "bcell", "dendritic", "granulocyte"))
            ),

            actionButton("applyCorrelationFilters", "Apply Filters", class = "btn-info"),
            br(),br(),
            verbatimTextOutput("correlationCohortSummary")
          ),

          box(
            title = "Correlation Settings", status = "primary", solidHeader = TRUE, width = 4,
            selectInput("correlationMethod", "Correlation Method:",
                       choices = list("Spearman" = "spearman",
                                    "Pearson" = "pearson"),
                       selected = "spearman"),

            numericInput("minCorrelation", "Min Correlation to Display:",
                       value = 0, min = 0, max = 1, step = 0.1),

            checkboxInput("showCorrValues", "Show Correlation Values", value = TRUE),

            checkboxInput("clusterCorrelation", "Cluster Variables", value = TRUE),

            conditionalPanel(
              condition = "input.clusterCorrelation == true",
              selectInput("clusterMethod", "Clustering Method:",
                         choices = list("Complete" = "complete",
                                      "Average" = "average",
                                      "Single" = "single",
                                      "Ward" = "ward.D2"),
                         selected = "complete")
            )
          ),

          box(
            title = "Correlation Summary", status = "success", solidHeader = TRUE, width = 4,
            verbatimTextOutput("correlationSummary")
          )
        ),

        fluidRow(
          box(
            title = "Correlation Heatmap", status = "warning", solidHeader = TRUE, width = 12,
            withSpinner(
              plotlyOutput("correlationHeatmap", height = "700px"),
              type = 4, color = "#3c8dbc"
            )
          )
        )
      ),

      # Tab 6: PCA Analysis
      tabItem(tabName = "pca",
        fluidRow(
          box(
            title = "Cohort & Parameter Selection", status = "info", solidHeader = TRUE, width = 4,
            h5("Filter Participants:"),
            checkboxGroupInput("pcaAgeGroupFilter", "Age Groups:",
                              choices = list("18-29" = "18-29 years",
                                           "30-44" = "30-44 years",
                                           "45-59" = "45-59 years",
                                           "60-74" = "60-74 years",
                                           "75+" = "75+ years"),
                              selected = c("18-29 years", "30-44 years", "45-59 years", "60-74 years", "75+ years")),

            checkboxGroupInput("pcaGenderFilter", "Gender:",
                              choices = list("Male" = "Male", "Female" = "Female"),
                              selected = c("Male", "Female")),

            checkboxGroupInput("pcaHbA1cFilter", "HbA1c Category:",
                              choices = list("Normal" = "Normal",
                                           "Prediabetic" = "Prediabetic",
                                           "Diabetic" = "Diabetic"),
                              selected = c("Normal", "Prediabetic", "Diabetic")),

            checkboxGroupInput("pcaProviderFilter", "Provider:",
                              choices = NULL,
                              selected = NULL),

            checkboxGroupInput("pcaParameterType", "Parameter Type:",
                              choices = list("Blood Biochemistry" = "blood",
                                           "Immune Phenotyping" = "immune"),
                              selected = c("blood", "immune")),

            conditionalPanel(
              condition = "input.pcaParameterType.includes('immune')",
              checkboxGroupInput("pcaImmuneCellType", "Immune Cell Types:",
                                choices = list("T Cells" = "tcell",
                                             "B Cells" = "bcell",
                                             "Dendritic Cells" = "dendritic",
                                             "Granulocytes" = "granulocyte"),
                                selected = c("tcell", "bcell", "dendritic", "granulocyte"))
            ),

            actionButton("applyPCAFilters", "Apply Filters", class = "btn-info"),
            br(),br(),
            verbatimTextOutput("pcaCohortSummary")
          ),

          box(
            title = "PCA Configuration", status = "primary", solidHeader = TRUE, width = 4,
            h5("Data Preprocessing:"),
            checkboxInput("scaleData", "Scale Variables", value = TRUE),
            checkboxInput("centerData", "Center Variables", value = TRUE),

            radioButtons("missingValues", "Handle Missing Values:",
                        choices = list("Remove rows" = "remove",
                                     "Mean imputation" = "mean",
                                     "Median imputation" = "median")),

            numericInput("minVariance", "Minimum Variance Threshold:",
                        value = 0.01, min = 0, max = 1, step = 0.01),

            br(),
            actionButton("runPCA", "Run PCA", class = "btn-primary")
          ),

          box(
            title = "Visualization Options", status = "success", solidHeader = TRUE, width = 4,
            h5("Plot Settings:"),
            selectInput("pcaColorBy", "Color By:",
                       choices = list("Age Group" = "age_group_label",
                                    "Gender" = "gender_label",
                                    "HbA1c Category" = "hba1c_category",
                                    "Provider" = "Provider",
                                    "Age" = "Age",
                                    "Continuous Variable" = "continuous")),

            conditionalPanel(
              condition = "input.pcaColorBy == 'continuous'",
              selectInput("pcaContinuousColor", "Continuous Variable:",
                         choices = NULL)
            ),

            conditionalPanel(
              condition = "input.pcaColorBy == 'continuous' || input.pcaColorBy == 'Age'",
              selectInput("pcaColorScale", "Color Scale:",
                         choices = list("Viridis" = "viridis",
                                      "Plasma" = "plasma",
                                      "Inferno" = "inferno",
                                      "Magma" = "magma",
                                      "Cividis" = "cividis",
                                      "Blue-Red" = "blue_red",
                                      "Red-Blue" = "red_blue"),
                         selected = "viridis")
            ),

            selectInput("pcX", "PC X-axis:", choices = NULL),
            selectInput("pcY", "PC Y-axis:", choices = NULL)
          ),

          box(
            title = "Scree Plot", status = "info", solidHeader = TRUE, width = 6,
            plotlyOutput("screePlot")
          ),

          box(
            title = "Variance Explained", status = "info", solidHeader = TRUE, width = 6,
            DT::dataTableOutput("varianceTable")
          )
        ),

        fluidRow(
          box(
            title = "PCA Biplot", status = "success", solidHeader = TRUE, width = 8,
            withSpinner(
              plotlyOutput("pcaBiplot", height = "600px"),
              type = 4, color = "#3c8dbc"
            )
          ),

          box(
            title = "Variable Loadings", status = "warning", solidHeader = TRUE, width = 4,
            DT::dataTableOutput("loadingsTable")
          )
        ),

        fluidRow(
          box(
            title = "PC-Metadata Correlation", status = "info", solidHeader = TRUE, width = 12,
            withSpinner(
              plotlyOutput("pcaCorrelationPlot", height = "500px"),
              type = 4, color = "#3c8dbc"
            )
          )
        )
      ),

      # Tab 7: Multivariable Analysis
      tabItem(tabName = "multivariable",
        fluidRow(
          box(
            title = "Cohort & Parameter Selection", status = "primary", solidHeader = TRUE, width = 4,
            h5("Subset Cohort:"),
            checkboxGroupInput("ageGroupFilter", "Age Groups:",
                              choices = list("18-29" = "18-29 years",
                                           "30-44" = "30-44 years",
                                           "45-59" = "45-59 years",
                                           "60-74" = "60-74 years",
                                           "75+" = "75+ years"),
                              selected = c("18-29 years", "30-44 years", "45-59 years", "60-74 years", "75+ years")),

            checkboxGroupInput("genderFilter", "Gender:",
                              choices = list("Male" = "Male", "Female" = "Female"),
                              selected = c("Male", "Female")),

            checkboxGroupInput("hba1cFilter", "HbA1c Status:",
                              choices = list("Normal" = "Normal",
                                           "Prediabetic" = "Prediabetic",
                                           "Diabetic" = "Diabetic"),
                              selected = c("Normal", "Prediabetic", "Diabetic")),

            checkboxGroupInput("providerFilter", "Provider:",
                              choices = NULL,
                              selected = NULL),

            checkboxGroupInput("multivariableParameterType", "Parameter Type:",
                              choices = list("Blood Biochemistry" = "blood",
                                           "Immune Phenotyping" = "immune"),
                              selected = c("blood", "immune")),

            conditionalPanel(
              condition = "input.multivariableParameterType.includes('immune')",
              checkboxGroupInput("multivariableImmuneCellType", "Immune Cell Types:",
                                choices = list("T Cells" = "tcell",
                                             "B Cells" = "bcell",
                                             "Dendritic Cells" = "dendritic",
                                             "Granulocytes" = "granulocyte"),
                                selected = c("tcell", "bcell", "dendritic", "granulocyte"))
            ),

            actionButton("applyFilters", "Apply Filters", class = "btn-info"),
            br(),br(),
            verbatimTextOutput("cohortSummary")
          ),

          box(
            title = "Regression Setup", status = "primary", solidHeader = TRUE, width = 8,
            fluidRow(
              column(6,
                h5("What are you trying to predict?"),
                selectInput("outcomeVar", "Outcome to Predict:",
                           choices = list("Age (continuous)" = "Age",
                                        "Gender (binary)" = "gender_label",
                                        "HbA1c Category (categorical)" = "hba1c_category",
                                        "Age Group (categorical)" = "age_group_label",
                                        "Provider (categorical)" = "Provider")),

                h5("Biochemical Predictors:"),
                selectInput("biochemPredictors", "Select Biomarkers:",
                           choices = NULL, multiple = TRUE),

                checkboxInput("includeAllBiomarkers", "Include All Available Biomarkers", value = FALSE)
              ),

              column(6,
                h5("Additional Confounders:"),
                checkboxGroupInput("confounders", "Also adjust for:",
                                  choices = list("Age" = "Age",
                                               "Gender" = "gender_label",
                                               "HbA1c Category" = "hba1c_category",
                                               "Age Group" = "age_group_label",
                                               "Provider" = "Provider"),
                                  selected = NULL),

                selectInput("missingDataMethod", "Regression Method:",
                           choices = list("Complete Cases Only" = "complete",
                                        "Random Forest (handles missing)" = "randomforest",
                                        "Elastic Net (handles missing)" = "glmnet",
                                        "Linear Regression + Mean Imputation" = "lm_mean",
                                        "Linear Regression + Median Imputation" = "lm_median",
                                        "Linear Regression + Mode Imputation" = "lm_mode"),
                           selected = "randomforest"),

                

                actionButton("runMultiRegression", "Find Best Predictors", class = "btn-success"),
                br(),br(),
                verbatimTextOutput("modelInfo")
              )
            )
          )
        ),

        fluidRow(
          box(
            title = "Regression Results", status = "success", solidHeader = TRUE, width = 6,
            verbatimTextOutput("regressionSummary")
          ),
          box(
            title = "Results Table", status = "info", solidHeader = TRUE, width = 6,
            DT::dataTableOutput("regressionResultsTable")
          )
        ),

        fluidRow(
          box(
            title = "Regression Plots", status = "warning", solidHeader = TRUE, width = 12,
            withSpinner(
              plotlyOutput("regressionPlots", height = "500px"),
              type = 4, color = "#3c8dbc"
            )
          )
        )
      ),

      # Tab 8: Immune Phenotyping
      tabItem(tabName = "immune_phenotyping",
        fluidRow(
          box(
            title = "Immune Lineage - Horizontal Interactive View",
            status = "success",
            solidHeader = TRUE,
            width = 12,
            fluidRow(
              column(10,
                p("Interactive immune cell hierarchy visualization across demographic groups.")
              ),
              column(2,
                div(style = "text-align: right; padding-top: 5px;",
                  tags$a(
                    href = "immune_phenotyping/immune_lineage_horizontal_interactive.html",
                    target = "_blank",
                    class = "btn btn-info btn-sm",
                    icon("external-link-alt"),
                    " New Window"
                  )
                )
              )
            ),
            div(
              style = "border: 1px solid #ddd; border-radius: 4px; height: 900px; overflow: auto; position: relative;",
              tags$iframe(
                src = "immune_phenotyping/immune_lineage_horizontal_interactive.html",
                width = "100%",
                height = "100%",
                frameborder = "0",
                id = "immune_horizontal_iframe",
                style = "border: none; display: block;",
                onload = "console.log('Immune horizontal tree loaded successfully');"
              )
            )
          )
        )

        # COMMENTED OUT - Old analysis controls
        # fluidRow(
        #   box(
        #     title = "Immune Analysis Controls", status = "primary", solidHeader = TRUE, width = 3,
        #     h5("Analysis Configuration:"),
        #     selectInput("immune_panel_select", "Panel Type:",
        #                choices = c("T Cells" = "tcells",
        #                          "B Cells" = "bcells",
        #                          "Granulocytes" = "granulocytes",
        #                          "Dendritic Cells" = "dendritic"),
        #                selected = "tcells"),
        #     selectInput("immune_metric_select", "Metric:",
        #                choices = c("% of Total Cells" = "% of Total Cells",
        #                          "% of Parent Population" = "% of Parent")),
        #     selectInput("comparison_mode", "Compare by:",
        #                choices = c("Age Groups" = "age",
        #                          "Gender" = "gender",
        #                          "HbA1c Status" = "hba1c",
        #                          "Provider" = "provider")),
        #     br(),
        #     h5("Cohort Filters:"),
        #     checkboxGroupInput("immune_age_filter", "Age Groups:",
        #                       choices = list("18-29" = "18-29 years",
        #                                    "30-44" = "30-44 years",
        #                                    "45-59" = "45-59 years",
        #                                    "60-74" = "60-74 years",
        #                                    "75+" = "75+ years"),
        #                       selected = c("18-29 years", "30-44 years", "45-59 years", "60-74 years", "75+ years")),
        #     checkboxGroupInput("immune_gender_filter", "Gender:",
        #                       choices = list("Male" = "Male", "Female" = "Female"),
        #                       selected = c("Male", "Female")),
        #     actionButton("apply_immune_filters", "Update Analysis", class = "btn-primary"),
        #     br(),br(),
        #     verbatimTextOutput("immune_cohort_summary")
        #   ),
        #   box(
        #     title = "Immune Parameter Analysis", status = "info", solidHeader = TRUE, width = 6,
        #     withSpinner(
        #       plotlyOutput("immune_parameter_plot", height = "400px"),
        #       type = 4, color = "#3c8dbc"
        #     )
        #   ),
        #   box(
        #     title = "Statistical Results", status = "warning", solidHeader = TRUE, width = 6,
        #     DT::dataTableOutput("immune_stats_table")
        #   )
        # )
      )
    )
  )
)