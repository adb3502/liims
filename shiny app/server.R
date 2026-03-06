library(shiny)
library(shinydashboard)
library(DT)
library(plotly)
library(dplyr)
library(ggplot2)
library(readr)
library(corrr)
library(VIM)
library(purrr)
library(tidyr)
library(wesanderson)
library(shinycssloaders)

server <- function(input, output, session) {

  # ========== CONSTANTS ==========

  # Performance settings
  DEBOUNCE_MS <- 500
  MAX_PLOT_POINTS <- 500

  # Correlation thresholds
  CORRELATION_STRONG <- 0.7
  CORRELATION_MODERATE <- 0.5
  CORRELATION_WEAK <- 0.3

  # HbA1c clinical thresholds (%)
  HBA1C_PREDIABETIC <- 5.7
  HBA1C_DIABETIC <- 6.5

  # Debug mode
  DEBUG_MODE <- FALSE
  debug_cat <- function(...) { if(DEBUG_MODE) cat(...) }

  # Reactive values to store data
  values <- reactiveValues(
    raw_data = NULL,
    clean_data = NULL,
    duplicates = NULL,
    pca_result = NULL,
    immune_data = NULL,
    immune_processed = NULL,
    combined_data = NULL
  )

  # ========== UTILITY FUNCTIONS ==========

  # Assign age groups based on actual Age column
  assign_age_groups <- function(age_values, participant_ids = NULL) {
    # First try to use actual Age column
    age_group_from_age <- case_when(
      !is.na(age_values) & age_values >= 18 & age_values <= 29 ~ "18-29 years",
      !is.na(age_values) & age_values >= 30 & age_values <= 44 ~ "30-44 years",
      !is.na(age_values) & age_values >= 45 & age_values <= 59 ~ "45-59 years",
      !is.na(age_values) & age_values >= 60 & age_values <= 74 ~ "60-74 years",
      !is.na(age_values) & age_values >= 75 ~ "75+ years",
      TRUE ~ NA_character_
    )

    # If Age is missing, extract from participant ID (first digit: 1=18-29, 2=30-44, etc.)
    if (!is.null(participant_ids)) {
      age_code <- substr(participant_ids, 1, 1)
      age_group_from_id <- case_when(
        age_code == "1" ~ "18-29 years",
        age_code == "2" ~ "30-44 years",
        age_code == "3" ~ "45-59 years",
        age_code == "4" ~ "60-74 years",
        age_code == "5" ~ "75+ years",
        TRUE ~ "Unknown"
      )
      # Use Age column if available, otherwise use participant ID
      return(ifelse(is.na(age_group_from_age), age_group_from_id, age_group_from_age))
    }

    return(ifelse(is.na(age_group_from_age), "Unknown", age_group_from_age))
  }

  # Parse participant ID to extract gender and age group
  parse_participant_id <- function(participant_id) {
    gender_code <- substr(participant_id, 2, 2)
    age_code <- substr(participant_id, 1, 1)

    gender_label <- case_when(
      gender_code == "A" ~ "Male",
      gender_code == "B" ~ "Female",
      TRUE ~ "Unknown"
    )

    age_group_from_id <- case_when(
      age_code == "1" ~ "18-29 years",
      age_code == "2" ~ "30-44 years",
      age_code == "3" ~ "45-59 years",
      age_code == "4" ~ "60-74 years",
      age_code == "5" ~ "75+ years",
      TRUE ~ "Unknown"
    )

    # Return gender and age group from ID
    return(data.frame(
      gender_label = gender_label,
      age_group_from_id = age_group_from_id,
      stringsAsFactors = FALSE
    ))
  }

  # Categorize HbA1c values using clinical thresholds
  categorize_hba1c <- function(hba1c_values) {
    case_when(
      hba1c_values < HBA1C_PREDIABETIC ~ "Normal",
      hba1c_values >= HBA1C_PREDIABETIC & hba1c_values < HBA1C_DIABETIC ~ "Prediabetic",
      hba1c_values >= HBA1C_DIABETIC ~ "Diabetic",
      TRUE ~ NA_character_
    )
  }

  # Smart data subsetting for large plots - preserves distribution
  smart_subset_for_plot <- function(data, max_points = MAX_PLOT_POINTS, group_cols = NULL) {
    if (nrow(data) <= max_points) {
      return(data)  # No need to subset
    }

    cat("Subsetting", nrow(data), "points to", max_points, "for faster plotting\n")

    if (!is.null(group_cols) && all(group_cols %in% names(data))) {
      # Stratified sampling - preserve distribution across groups
      data %>%
        group_by(across(all_of(group_cols))) %>%
        slice_sample(prop = max_points / nrow(data)) %>%
        ungroup()
    } else {
      # Simple random sampling
      data %>% slice_sample(n = min(max_points, nrow(data)))
    }
  }

  # ========== IMMUNE DATA FUNCTIONS ==========

  # Extract participant ID from immune tube names
  extract_participant_id_from_tube <- function(tube_name) {
    # Remove file extension and suffix (e.g., "1A-001_T.fcs" -> "1A-001")
    participant_id <- sub("_[TBGD][^_]*(?:\\.fcs)?$", "", tube_name)
    cat("Tube name:", tube_name, "-> Participant ID:", participant_id, "\n")
    return(participant_id)
  }

  # Load and process immune data from CSV files
  load_immune_data <- function() {
    immune_files <- list(
      tcells = "immune phenotyping/TCells.csv",
      bcells = "immune phenotyping/B cells.csv",
      granulocytes = "immune phenotyping/Gr Cells.csv",
      dendritic = "immune phenotyping/DC cells.csv"
    )

    immune_data <- list()
    cat("Starting immune data loading...\n")

    for (panel_name in names(immune_files)) {
      file_path <- immune_files[[panel_name]]
      cat("Checking for file:", file_path, "\n")

      if (file.exists(file_path)) {
        cat("Found file:", file_path, "\n")
        tryCatch({
          # Read CSV file with suppressed messages
          raw_data <- read_csv(file_path, locale = locale(encoding = "UTF-8"), show_col_types = FALSE)

          # Safety check: ensure data has at least one column
          if (ncol(raw_data) == 0 || nrow(raw_data) == 0) {
            cat("WARNING: File", file_path, "is empty or has no columns\n")
            immune_data[[panel_name]] <- NULL
            next
          }

          # Extract participant IDs from tube names (safely get first column)
          first_col_name <- names(raw_data)[1]
          cat("Extracting IDs from column:", first_col_name, "\n")
          raw_data$Participant_ID <- sapply(raw_data[[first_col_name]], extract_participant_id_from_tube)

          # Add panel type identifier
          raw_data$Panel_Type <- panel_name

          # Convert frequency/percentage columns to numeric
          freq_cols <- grep("Freq\\.|% ", names(raw_data), value = TRUE)
          for (col in freq_cols) {
            if (is.character(raw_data[[col]]) || is.factor(raw_data[[col]])) {
              # Convert percentage strings to numeric (e.g., "12.34%" -> 12.34)
              raw_data[[col]] <- as.numeric(gsub("[%,]", "", as.character(raw_data[[col]])))
              cat("Converted column", col, "from character to numeric\n")
            }
          }

          immune_data[[panel_name]] <- raw_data
          cat("✓ Successfully loaded", panel_name, "data:", nrow(raw_data), "rows,", ncol(raw_data), "columns\n")

        }, error = function(e) {
          cat("✗ ERROR loading", panel_name, "data:", e$message, "\n")
          immune_data[[panel_name]] <- NULL
        })
      } else {
        cat("✗ File not found:", file_path, "\n")
      }
    }

    cat("\n=== Immune Data Loading Summary ===\n")
    loaded_count <- sum(sapply(immune_data, function(x) !is.null(x)))
    cat("Panels loaded:", loaded_count, "/", length(immune_files), "\n")
    if (loaded_count > 0) {
      for (panel in names(immune_data)) {
        if (!is.null(immune_data[[panel]])) {
          cat("  -", panel, ":", nrow(immune_data[[panel]]), "samples\n")
        }
      }
    }
    cat("===================================\n\n")

    return(immune_data)
  }

  # Process immune data for analysis (extract key parameters)
  process_immune_data <- function(immune_data) {
    processed_data <- data.frame()

    for (panel_name in names(immune_data)) {
      if (!is.null(immune_data[[panel_name]])) {
        panel_data <- immune_data[[panel_name]]

        # Extract frequency/percentage columns for analysis
        freq_cols <- grep("Freq\\.|% ", names(panel_data), value = TRUE)

        # Select key columns: Participant_ID, Panel_Type, and frequency columns
        selected_cols <- c("Participant_ID", "Panel_Type", freq_cols)
        available_cols <- intersect(selected_cols, names(panel_data))

        if (length(available_cols) > 2) {  # At least Participant_ID, Panel_Type, and one data column
          panel_processed <- panel_data[, available_cols, drop = FALSE]

          # Add descriptive panel name
          panel_processed$Panel_Name <- case_when(
            panel_name == "tcells" ~ "T Cells",
            panel_name == "bcells" ~ "B Cells",
            panel_name == "granulocytes" ~ "Granulocytes",
            panel_name == "dendritic" ~ "Dendritic Cells",
            TRUE ~ panel_name
          )

          if (nrow(processed_data) == 0) {
            processed_data <- panel_processed
          } else {
            processed_data <- bind_rows(processed_data, panel_processed)
          }
        }
      }
    }

    return(processed_data)
  }

  # Get immune parameter choices for UI dropdowns
  get_immune_parameters <- function(immune_data) {
    all_params <- list()

    for (panel_name in names(immune_data)) {
      if (!is.null(immune_data[[panel_name]])) {
        panel_data <- immune_data[[panel_name]]

        # Get frequency/percentage columns
        freq_cols <- grep("Freq\\.|% ", names(panel_data), value = TRUE)

        # Filter out non-informative gating columns
        # Exclude: All Events, CD45, Singlets, Lymphs, P1/P2, Q1-Q4, and any % Total or % Parent from these gates
        exclude_patterns <- c(
          "^All Events",           # All Events
          "^CD45 Events",          # CD45 Events
          "^CD45 %",               # CD45 % Total, CD45 % Parent
          "^Singlets",             # Singlets Events
          "^Lymphs",               # Lymphs Events
          "^P1 Events",            # P1 Events
          "^P2 Events",            # P2 Events
          "^P1 %",                 # P1 % Total, P1 % Parent (with any suffix)
          "^P2 %",                 # P2 % Total, P2 % Parent (with any suffix)
          "^Q[1-4][-_]",           # Q1-, Q2-, Q3-, Q4- (quadrant gates)
          "^Q[1-4] %",             # Q1 %, Q2 %, Q3 %, Q4 %
          "% Total\\.x$",          # Any column ending in % Total.x
          "% Total\\.y$",          # Any column ending in % Total.y
          "% Parent\\.x$",         # Any column ending in % Parent.x
          "% Parent\\.y$"          # Any column ending in % Parent.y
        )

        # Remove columns matching any exclude pattern
        for (pattern in exclude_patterns) {
          freq_cols <- freq_cols[!grepl(pattern, freq_cols, ignore.case = FALSE)]
        }

        # Clean up parameter names for display
        clean_names <- gsub(" \\| Freq\\. of [^(]*\\(%\\)", "", freq_cols)
        clean_names <- gsub("% ", "", clean_names)

        panel_label <- case_when(
          panel_name == "tcells" ~ "T Cells",
          panel_name == "bcells" ~ "B Cells",
          panel_name == "granulocytes" ~ "Granulocytes",
          panel_name == "dendritic" ~ "Dendritic Cells",
          TRUE ~ panel_name
        )

        if (length(clean_names) > 0) {
          # Create named list for selectInput choices
          panel_choices <- setNames(freq_cols, paste0(panel_label, ": ", clean_names))
          all_params <- c(all_params, panel_choices)
        }
      }
    }

    return(all_params)
  }

  # Filter columns based on parameter type selection (now supports multiple checkboxes)
  filter_columns_by_parameter_type <- function(data_for_columns, immune_params, parameter_types, immune_cell_types = NULL) {
    metadata_cols <- c("Age", "age_group_label", "gender_label", "hba1c_category", "Participant_ID")

    cat("DEBUG filter_columns_by_parameter_type:\n")
    cat("  Input parameter_types:", paste(parameter_types, collapse=", "), "\n")
    cat("  Input cell_types:", paste(immune_cell_types, collapse=", "), "\n")

    # Get ALL column names from the actual data
    all_data_cols <- names(data_for_columns)

    # Identify immune columns by pattern matching on actual data column names
    all_immune_cols_in_data <- grep("_(T_CELL|B_CELL|DENDRITIC|GRANULOCYTE)$", all_data_cols, value = TRUE)
    cat("  Total immune columns in data:", length(all_immune_cols_in_data), "\n")

    # Filter immune columns by cell type if specified
    actual_immune_cols <- all_immune_cols_in_data  # Start with all immune columns

    if (!is.null(immune_cell_types) && length(immune_cell_types) > 0 && length(all_immune_cols_in_data) > 0) {
      filtered_immune_cols <- character(0)

      if ("tcell" %in% immune_cell_types) {
        tcell_cols <- grep("_T_CELL$", all_immune_cols_in_data, value = TRUE)
        cat("  T cells found:", length(tcell_cols), "\n")
        filtered_immune_cols <- c(filtered_immune_cols, tcell_cols)
      }
      if ("bcell" %in% immune_cell_types) {
        bcell_cols <- grep("_B_CELL$", all_immune_cols_in_data, value = TRUE)
        cat("  B cells found:", length(bcell_cols), "\n")
        filtered_immune_cols <- c(filtered_immune_cols, bcell_cols)
      }
      if ("dendritic" %in% immune_cell_types) {
        dc_cols <- grep("_DENDRITIC$", all_immune_cols_in_data, value = TRUE)
        cat("  DC found:", length(dc_cols), "\n")
        filtered_immune_cols <- c(filtered_immune_cols, dc_cols)
      }
      if ("granulocyte" %in% immune_cell_types) {
        gran_cols <- grep("_GRANULOCYTE$", all_immune_cols_in_data, value = TRUE)
        cat("  Granulocytes found:", length(gran_cols), "\n")
        filtered_immune_cols <- c(filtered_immune_cols, gran_cols)
      }

      actual_immune_cols <- unique(filtered_immune_cols)
      cat("  Filtered immune columns:", length(actual_immune_cols), "\n")
    }

    # Get blood columns (everything except metadata and immune)
    # Blood = all numeric columns that are NOT immune markers
    all_cols_except_metadata <- data_for_columns %>%
      select(-any_of(c("Participant_ID", "Provider", "Immune_Data_Available", "Data_Type",
                      "Age", "age_group_label", "gender_label", "hba1c_category", "age_gender"))) %>%
      names()

    # Identify immune columns by pattern (CD markers, HLA, etc.)
    immune_pattern_cols <- grep("CD[0-9]+|HLA|Freq\\.|% ", all_cols_except_metadata, value = TRUE)

    # Filter out non-informative gating columns from immune data
    exclude_patterns <- c(
      "^All Events",
      "^CD45 Events",
      "^CD45 %",
      "^Singlets",
      "^Lymphs",
      "^P1 Events",
      "^P2 Events",
      "^P1 %",
      "^P2 %",
      "^Q[1-4][-_]",
      "^Q[1-4] %",
      "% Total\\.x$",
      "% Total\\.y$",
      "% Parent\\.x$",
      "% Parent\\.y$"
    )

    # Remove excluded columns
    for (pattern in exclude_patterns) {
      immune_pattern_cols <- immune_pattern_cols[!grepl(pattern, immune_pattern_cols)]
    }

    blood_cols <- setdiff(all_cols_except_metadata, immune_pattern_cols)

    cat("  Total data columns:", length(all_cols_except_metadata), "\n")
    cat("  Immune columns found (by pattern):", length(immune_pattern_cols), "\n")
    cat("  Blood columns available:", length(blood_cols), "\n")

    # Build selected columns based STRICTLY on parameter types
    selected_cols <- metadata_cols  # Always include metadata

    cat("  Parameter types received:", paste(parameter_types, collapse = ", "), "\n")

    # STRICT filtering: only add what's selected
    if ("blood" %in% parameter_types && !"immune" %in% parameter_types) {
      # Blood ONLY
      selected_cols <- c(selected_cols, blood_cols)
      cat("  MODE: Blood only - added", length(blood_cols), "blood columns\n")
    } else if ("immune" %in% parameter_types && !"blood" %in% parameter_types) {
      # Immune ONLY
      selected_cols <- c(selected_cols, immune_pattern_cols)
      cat("  MODE: Immune only - added", length(immune_pattern_cols), "immune columns\n")
    } else if ("blood" %in% parameter_types && "immune" %in% parameter_types) {
      # Both
      selected_cols <- c(selected_cols, blood_cols, immune_pattern_cols)
      cat("  MODE: Both - added", length(blood_cols), "blood +", length(immune_pattern_cols), "immune columns\n")
    } else {
      # Neither (shouldn't happen, but just metadata)
      cat("  MODE: Neither selected - only metadata\n")
    }

    cat("  FINAL selected columns:", length(unique(selected_cols)), "\n")
    return(unique(selected_cols))
  }

  # Map display names back to actual column names
  map_display_to_actual_names <- function(selected_names, immune_params) {
    if (length(immune_params) == 0) return(selected_names)

    actual_names <- selected_names
    for (i in seq_along(selected_names)) {
      selected_name <- selected_names[i]
      # Check if this is a display name that needs mapping
      if (selected_name %in% names(immune_params)) {
        # Map display name to actual column name
        actual_names[i] <- as.character(immune_params[selected_name])
      }
    }
    return(actual_names)
  }

  # ========== OPTIMIZED REACTIVE DATA LOADERS ==========

  # PHASE 1 OPTIMIZATION: Consolidated immune data loading (replaces 3 duplicate blocks)
  # This reactive expression loads immune data ONCE and caches the result
  immune_data_reactive <- reactive({
    cat("Loading immune data (cached reactive)...\n")
    load_immune_data()
  }) %>% bindCache("immune_data_cache")

  # Process and merge immune data with blood data - SINGLE SOURCE OF TRUTH
  merged_immune_blood_data <- reactive({
    req(values$clean_data)

    cat("Merging immune and blood data...\n")
    immune_data <- immune_data_reactive()

    if (length(immune_data) == 0) {
      cat("No immune data available\n")
      return(values$clean_data %>%
        mutate(
          Immune_Data_Available = FALSE,
          Data_Type = "Blood Biochemistry"
        ))
    }

    # Process immune data
    immune_processed <- process_immune_data(immune_data)
    values$immune_data <- immune_data  # Store for later use
    values$immune_processed <- immune_processed

    if (nrow(immune_processed) == 0) {
      return(values$clean_data %>%
        mutate(
          Immune_Data_Available = FALSE,
          Data_Type = "Blood Biochemistry"
        ))
    }

    all_immune_data <- data.frame()
    for (panel_name in names(immune_data)) {
      if (!is.null(immune_data[[panel_name]]) && nrow(immune_data[[panel_name]]) > 0) {
        panel_data <- immune_data[[panel_name]]
        panel_freq_cols <- grep("Freq\\.|% ", names(panel_data), value = TRUE)

        panel_subset <- panel_data %>%
          select(Participant_ID, any_of(panel_freq_cols))

        if (nrow(all_immune_data) == 0) {
          all_immune_data <- panel_subset
        } else {
          all_immune_data <- all_immune_data %>%
            full_join(panel_subset, by = "Participant_ID")
        }
      }
    }

    all_immune_data$Immune_Data_Available <- TRUE

    # Merge with blood data
    combined <- values$clean_data %>%
      left_join(all_immune_data, by = "Participant_ID") %>%
      mutate(
        Immune_Data_Available = ifelse(is.na(Immune_Data_Available), FALSE, Immune_Data_Available),
        Data_Type = case_when(
          Immune_Data_Available ~ "Both",
          TRUE ~ "Blood Biochemistry"
        )
      )

    cat("Successfully merged data. Participants with immune data:",
        sum(combined$Immune_Data_Available, na.rm = TRUE), "\n")

    # Debug: Show sample of immune column names
    immune_col_samples <- grep("CD3|CD19|CD14|HLA", names(combined), value = TRUE)[1:10]
    cat("Sample immune column names in merged data:", paste(immune_col_samples, collapse = ", "), "\n")

    return(combined)
  }) %>% bindCache(values$clean_data)

  # ========== TAB 1: DATA LOADING & VERIFICATION ==========

  # PHASE 1 OPTIMIZATION: Single observe block for startup loading (was 2 competing blocks)
  observe({
    # Only auto-load if no data is currently loaded
    if (is.null(values$clean_data)) {
      cat("\n")
      cat("========================================\n")
      cat("   BHARAT DASHBOARD - STARTUP\n")
      cat("========================================\n")
      cat("Starting automatic data loading...\n\n")

      # Show progress
      withProgress(message = 'Loading data...', value = 0, {

        # Try RDS first, fall back to CSV processing
        if (file.exists("bharat_clean_data.rds")) {
          cat("→ Loading from bharat_clean_data.rds (cached)...\n")
          incProgress(0.3, detail = "Loading blood biochemistry data...")
          temp_data <- tryCatch({
            readRDS("bharat_clean_data.rds")
          }, error = function(e) {
            cat("✗ ERROR: Failed to load RDS file:", e$message, "\n")
            showNotification(paste("Error loading cached data:", e$message), type = "error")
            return(NULL)
          })
          if (is.null(temp_data)) return()
          cat("✓ Loaded", nrow(temp_data), "participants from RDS\n")
        } else if (file.exists("processed_data.csv")) {
          cat("→ RDS not found, loading from processed_data.csv...\n")
          incProgress(0.2, detail = "Processing CSV data...")
          temp_data <- tryCatch({
            read_csv("processed_data.csv", locale = locale(encoding = "UTF-8"), show_col_types = FALSE)
          }, error = function(e) {
            cat("✗ ERROR: Failed to load CSV:", e$message, "\n")
            showNotification(paste("Error loading CSV:", e$message), type = "error")
            return(NULL)
          })
          if (is.null(temp_data)) return()
          cat("✓ Loaded", nrow(temp_data), "rows from processed_data.csv\n")
        } else if (file.exists("merged_blood_biochemistry_data.csv")) {
          cat("→ Loading merged_blood_biochemistry_data.csv...\n")
          incProgress(0.2, detail = "Processing blood biochemistry data...")
          temp_data <- tryCatch({
            read_csv("merged_blood_biochemistry_data.csv", locale = locale(encoding = "UTF-8"), show_col_types = FALSE)
          }, error = function(e) {
            cat("✗ ERROR: Failed to load CSV:", e$message, "\n")
            showNotification(paste("Error loading CSV:", e$message), type = "error")
            return(NULL)
          })
          if (is.null(temp_data)) return()
          cat("✓ Loaded", nrow(temp_data), "rows from merged_blood_biochemistry_data.csv\n")
        } else {
          cat("✗ ERROR: No data files found!\n")
          cat("  Expected files:\n")
          cat("    - bharat_clean_data.rds\n")
          cat("    - processed_data.csv\n")
          cat("    - merged_blood_biochemistry_data.csv\n")
          showNotification(
            "No data files found. Please run the data preparation pipeline first.",
            type = "error",
            duration = NULL
          )
          return()
        }

        incProgress(0.3, detail = "Processing participant data...")

        # Check if data needs processing (missing derived columns or has old structure)
        needs_processing <- !all(c("age_group_label", "gender_label", "hba1c_category") %in% names(temp_data)) ||
                           "age_group" %in% names(temp_data) ||
                           any(grepl("\\(.*,.*\\)", temp_data$gender_label %||% character(0)), na.rm = TRUE)

        if (needs_processing) {
          cat("→ Processing participant demographics...\n")

          # Validate required columns
          required_cols <- c("Participant_ID")
          missing_cols <- setdiff(required_cols, names(temp_data))
          if (length(missing_cols) > 0) {
            cat("✗ ERROR: Missing required columns:", paste(missing_cols, collapse=", "), "\n")
            showNotification(
              paste("Error: Missing required columns:", paste(missing_cols, collapse=", ")),
              type = "error",
              duration = NULL
            )
            return()
          }

          # Parse participant IDs for gender and age group
          cat("  → Parsing participant IDs...\n")
          participant_info <- temp_data$Participant_ID %>%
            map_dfr(~ parse_participant_id(.x))

          # Create clean data with derived columns
          cat("  → Creating derived variables (age groups, HbA1c categories)...\n")
          clean_data <- temp_data %>%
            select(-any_of(c("age_group", "gender", "age_group_label", "gender_label", "age_gender", "hba1c_category"))) %>%
            bind_cols(participant_info) %>%
            mutate(
              # Use Age column if available, otherwise use age from participant ID
              age_group_label = if("Age" %in% names(.)) assign_age_groups(Age, Participant_ID) else assign_age_groups(NA_real_, Participant_ID),
              hba1c_category = if("HbA1c" %in% names(.)) categorize_hba1c(HbA1c) else NA_character_,
              age_gender = paste(age_group_label, gender_label, sep = " - ")
            ) %>%
            select(-age_group_from_id)  # Remove temp column

          values$clean_data <- clean_data
          cat("✓ Processed", nrow(clean_data), "participants with", ncol(clean_data), "variables\n")

          # Save RDS for faster loading next time
          cat("  → Saving to bharat_clean_data.rds for faster loading next time...\n")
          tryCatch({
            saveRDS(clean_data, "bharat_clean_data.rds")
            cat("✓ Cache saved successfully\n")
          }, error = function(e) {
            cat("⚠ Warning: Could not save cache:", e$message, "\n")
          })
        } else {
          cat("✓ Data already processed, using as-is\n")
          values$clean_data <- temp_data
        }

        cat("\n→ Loading immune phenotyping data...\n")
        incProgress(0.4, detail = "Merging immune data...")

        # PHASE 1: Use new consolidated reactive instead of duplicate code (200+ lines eliminated!)
        tryCatch({
          values$combined_data <- merged_immune_blood_data()
          incProgress(0.3, detail = "Updating UI...")

          immune_count <- sum(values$combined_data$Immune_Data_Available, na.rm = TRUE)
          if (immune_count > 0) {
            cat("✓ Merged immune data for", immune_count, "participants\n")
          } else {
            cat("⚠ No immune data available (or not matched to blood data)\n")
          }
        }, error = function(e) {
          cat("✗ ERROR loading immune data:", e$message, "\n")
          cat("  Continuing with blood biochemistry data only...\n")
          values$combined_data <- values$clean_data %>%
            mutate(
              Immune_Data_Available = FALSE,
              Data_Type = "Blood Biochemistry"
            )
        })

        # Update column choices for exploration tabs (use combined data if available)
        data_for_columns <- if (!is.null(values$combined_data)) values$combined_data else values$clean_data

        numeric_cols <- data_for_columns %>%
          select_if(is.numeric) %>%
          names()

        exploration_cols <- data_for_columns %>%
          select(-any_of(c("Participant_ID", "Provider", "Immune_Data_Available", "Data_Type"))) %>%
          names()

        # Add immune parameters if available
        immune_params <- list()
        if (!is.null(values$immune_data)) {
          immune_params <- get_immune_parameters(values$immune_data)
        }

        # Combine blood biochemistry and immune parameters
        combined_choices <- c(exploration_cols, immune_params)
        combined_numeric <- c(numeric_cols, names(immune_params))

        updateSelectInput(session, "column", choices = combined_choices)
        updateSelectInput(session, "xVariable", choices = combined_numeric)
        updateSelectInput(session, "yVariable", choices = combined_numeric)
        updateSelectInput(session, "continuousColor", choices = combined_numeric)
        updateSelectInput(session, "pcaContinuousColor", choices = combined_numeric)

        # Update biomarker predictors (exclude metadata columns)
        biomarker_cols <- combined_numeric[!combined_numeric %in% c("Age")]  # Exclude Age from biomarkers
        updateSelectInput(session, "biochemPredictors", choices = biomarker_cols)

        # Get categorical columns for custom predictor
        categorical_cols <- names(data_for_columns)[!names(data_for_columns) %in% numeric_cols]
        all_cols <- c(combined_numeric, categorical_cols)
        updateSelectInput(session, "customPredictor", choices = all_cols)

        # Update provider filter choices for all tabs
        if ("Provider" %in% names(values$clean_data)) {
          provider_choices <- unique(values$clean_data$Provider)
          cat("→ Updating UI filters (providers, parameters)...\n")
          updateSelectInput(session, "providerFilter", choices = provider_choices,
                           selected = provider_choices)
          updateSelectInput(session, "explorationProviderFilter", choices = provider_choices,
                           selected = provider_choices)
          updateSelectInput(session, "correlationProviderFilter", choices = provider_choices,
                           selected = provider_choices)
          updateSelectInput(session, "pcaProviderFilter", choices = provider_choices,
                           selected = provider_choices)
        }

        cat("\n========================================\n")
        cat("✓ Dashboard ready!\n")
        cat("  Participants:", nrow(values$combined_data), "\n")
        cat("  Variables:", ncol(values$combined_data), "\n")
        cat("  With immune data:", sum(values$combined_data$Immune_Data_Available, na.rm = TRUE), "\n")
        cat("========================================\n\n")

        showNotification(
          paste0("Dashboard loaded successfully! ", nrow(values$combined_data), " participants ready for analysis."),
          type = "message",
          duration = 5
        )
      })  # Close withProgress
    }
  })

  # PHASE 1: REMOVED 163 lines of duplicate immune loading code!
  # Now handled by merged_immune_blood_data() reactive above

  output$uploadStatus <- renderText({
    if (is.null(values$combined_data)) {
      "Initializing data..."
    } else {
      immune_count <- sum(values$combined_data$Immune_Data_Available, na.rm = TRUE)
      sprintf("Loaded: %d participants (%d with immune data)",
              nrow(values$combined_data), immune_count)
    }
  })

  # Data preview table showing all columns including immune data
  output$dataPreview <- DT::renderDataTable({
    req(values$combined_data)

    # Show all columns in the preview
    DT::datatable(
      values$combined_data,
      options = list(
        pageLength = 25,
        scrollX = TRUE,
        scrollY = "400px",
        dom = 'Bfrtip',
        buttons = c('copy', 'csv', 'excel')
      ),
      filter = 'top',
      rownames = FALSE,
      class = 'cell-border stripe'
    )
  })

  # PHASE 1: Refresh immune data - now uses consolidated reactive (130+ lines removed!)
  observeEvent(input$refreshImmune, {
    if (!is.null(values$clean_data)) {
      cat("Manual immune data refresh triggered...\n")

      withProgress(message = 'Refreshing immune data...', value = 0, {
        tryCatch({
          # Clear cache to force reload
          immune_data_reactive() # Trigger reload
          incProgress(0.5, detail = "Merging data...")

          # Use our optimized reactive
          values$combined_data <- merged_immune_blood_data()

          incProgress(0.5, detail = "Updating UI...")

          # Update column choices
          data_for_columns <- values$combined_data
          numeric_cols <- data_for_columns %>%
            select_if(is.numeric) %>%
            names()

          exploration_cols <- data_for_columns %>%
            select(-any_of(c("Participant_ID", "Provider", "Immune_Data_Available", "Data_Type"))) %>%
            names()

          # Add immune parameters if available
          immune_params <- if(!is.null(values$immune_data)) get_immune_parameters(values$immune_data) else list()
          combined_choices <- c(exploration_cols, immune_params)
          combined_numeric <- c(numeric_cols, names(immune_params))

          updateSelectInput(session, "column", choices = combined_choices)
          updateSelectInput(session, "xVariable", choices = combined_numeric)
          updateSelectInput(session, "yVariable", choices = combined_numeric)
          updateSelectInput(session, "continuousColor", choices = combined_numeric)
          updateSelectInput(session, "pcaContinuousColor", choices = combined_numeric)

          showNotification("Immune data refreshed successfully!", type = "message")
        }, error = function(e) {
          cat("Error refreshing immune data:", e$message, "\n")
          showNotification(paste("Error refreshing immune data:", e$message), type = "error")
        })
      })
    } else {
      showNotification("Please load blood biochemistry data first", type = "warning")
    }
  })

  # ========== TAB 2: DISTRIBUTION ANALYSIS ==========

  # Value boxes
  output$totalParticipants <- renderValueBox({
    req(values$clean_data)
    valueBox(
      value = nrow(values$clean_data),
      subtitle = "Total Participants",
      icon = icon("users"),
      color = "blue"
    )
  })

  output$totalMales <- renderValueBox({
    req(values$clean_data)
    males <- sum(values$clean_data$gender_label == "Male", na.rm = TRUE)
    valueBox(
      value = males,
      subtitle = "Male Participants",
      icon = icon("male"),
      color = "green"
    )
  })

  output$totalFemales <- renderValueBox({
    req(values$clean_data)
    females <- sum(values$clean_data$gender_label == "Female", na.rm = TRUE)
    valueBox(
      value = females,
      subtitle = "Female Participants",
      icon = icon("female"),
      color = "purple"
    )
  })

  # Age group distribution
  output$ageGroupPlot <- renderPlotly({
    req(values$clean_data)

    tryCatch({
      age_counts <- values$clean_data %>%
        count(age_group_label) %>%
        filter(!is.na(age_group_label))

      # Create proper ordering for age groups
      age_order <- c("18-29 years", "30-44 years", "45-59 years", "60-74 years", "75+ years")
      age_counts$age_group_label <- factor(age_counts$age_group_label, levels = age_order)

      # Use plot_ly with vibrant blue gradient (medium to dark blue)
      age_colors <- c('#64B5F6', '#42A5F5', '#2196F3', '#1E88E5', '#1565C0')

      plot_ly(age_counts, x = ~age_group_label, y = ~n, type = 'bar',
              marker = list(color = age_colors),
              hovertemplate = paste('<b>Age Group:</b> %{x}<br>',
                                  '<b>Count:</b> %{y}<br>',
                                  '<extra></extra>')) %>%
        layout(title = "Distribution by Age Group",
               xaxis = list(title = "Age Group"),
               yaxis = list(title = "Count"),
               showlegend = FALSE)
    }, error = function(e) {
      cat("Error in ageGroupPlot:", e$message, "\n")
      print(e)
      return(NULL)
    })
  })

  # Gender distribution
  output$genderPlot <- renderPlotly({
    req(values$clean_data)

    tryCatch({
      gender_counts <- values$clean_data %>%
        count(gender_label) %>%
        filter(!is.na(gender_label))

      # Use plot_ly with traditional gender colors (blue for Male, pink for Female)
      # Ensure colors match the order in the data
      gender_colors <- ifelse(gender_counts$gender_label == "Male", '#42A5F5', '#EC407A')

      plot_ly(gender_counts, x = ~gender_label, y = ~n, type = 'bar',
              marker = list(color = gender_colors),
              hovertemplate = paste('<b>Gender:</b> %{x}<br>',
                                  '<b>Count:</b> %{y}<br>',
                                  '<extra></extra>')) %>%
        layout(title = "Distribution by Gender",
               xaxis = list(title = "Gender"),
               yaxis = list(title = "Count"),
               showlegend = FALSE)
    }, error = function(e) {
      cat("Error in genderPlot:", e$message, "\n")
      return(NULL)
    })
  })

  # Provider distribution
  output$providerPlot <- renderPlotly({
    req(values$clean_data)

    tryCatch({
      provider_counts <- values$clean_data %>%
        count(Provider) %>%
        filter(!is.na(Provider))

      # Use plot_ly directly
      plot_ly(provider_counts, x = ~Provider, y = ~n, type = 'bar',
              marker = list(color = c('#440154', '#31688e', '#35b779', '#fde724')),
              hovertemplate = paste('<b>Provider:</b> %{x}<br>',
                                  '<b>Count:</b> %{y}<br>',
                                  '<extra></extra>')) %>%
        layout(title = "Distribution by Provider",
               xaxis = list(title = "Provider"),
               yaxis = list(title = "Count"),
               showlegend = FALSE)
    }, error = function(e) {
      cat("Error in providerPlot:", e$message, "\n")
      return(NULL)
    })
  })

  # Age group × Gender distribution
  output$ageGenderPlot <- renderPlotly({
    req(values$clean_data)

    tryCatch({
      age_gender_counts <- values$clean_data %>%
        count(age_group_label, gender_label) %>%
        filter(!is.na(age_group_label), !is.na(gender_label))

      # Create proper ordering for age groups
      age_order <- c("18-29 years", "30-44 years", "45-59 years", "60-74 years", "75+ years")
      age_gender_counts$age_group_label <- factor(age_gender_counts$age_group_label, levels = age_order)

      # Use plot_ly directly with grouped bars - Blue for Male, Pink for Female
      plot_ly(age_gender_counts, x = ~age_group_label, y = ~n,
              color = ~gender_label, type = 'bar',
              colors = c('#EC407A', '#42A5F5'),  # Female = Pink, Male = Blue
              hovertemplate = paste('<b>Age Group:</b> %{x}<br>',
                                  '<b>Count:</b> %{y}<br>',
                                  '<b>Gender:</b> %{fullData.name}<br>',
                                  '<extra></extra>')) %>%
        layout(title = "Distribution by Age Group and Gender",
               xaxis = list(title = "Age Group"),
               yaxis = list(title = "Count"),
               barmode = 'group')
    }, error = function(e) {
      cat("Error in ageGenderPlot:", e$message, "\n")
      print(e)
      return(NULL)
    })
  })

  # Urban/Rural distribution
  output$urbanRuralPlot <- renderPlotly({
    req(values$clean_data)

    tryCatch({
      # Check if urban/rural column exists
      if (!"urban/rural" %in% names(values$clean_data)) {
        return(NULL)
      }

      urban_rural_counts <- values$clean_data %>%
        count(`urban/rural`) %>%
        filter(!is.na(`urban/rural`))

      # Use plot_ly directly with contrasting colors
      plot_ly(urban_rural_counts, x = ~`urban/rural`, y = ~n, type = 'bar',
              marker = list(color = c('#2E7D32', '#FF6F00')),  # Green for one, Orange for other
              hovertemplate = paste('<b>Location:</b> %{x}<br>',
                                  '<b>Count:</b> %{y}<br>',
                                  '<extra></extra>')) %>%
        layout(title = "Distribution by Urban/Rural",
               xaxis = list(title = "Location Type"),
               yaxis = list(title = "Count"),
               showlegend = FALSE)
    }, error = function(e) {
      cat("Error in urbanRuralPlot:", e$message, "\n")
      return(NULL)
    })
  })

  # Centre distribution
  output$centrePlot <- renderPlotly({
    req(values$clean_data)

    tryCatch({
      # Check if Centre column exists
      if (!"Centre" %in% names(values$clean_data)) {
        return(NULL)
      }

      centre_counts <- values$clean_data %>%
        count(Centre) %>%
        filter(!is.na(Centre))

      # Use plot_ly directly with distinct colors
      plot_ly(centre_counts, x = ~Centre, y = ~n, type = 'bar',
              marker = list(color = viridisLite::viridis(nrow(centre_counts))),
              hovertemplate = paste('<b>Centre:</b> %{x}<br>',
                                  '<b>Count:</b> %{y}<br>',
                                  '<extra></extra>')) %>%
        layout(title = "Distribution by Centre",
               xaxis = list(title = "Centre"),
               yaxis = list(title = "Count"),
               showlegend = FALSE)
    }, error = function(e) {
      cat("Error in centrePlot:", e$message, "\n")
      return(NULL)
    })
  })

  # HbA1c categories
  output$hba1cCategoryPlot <- renderPlotly({
    req(values$clean_data)

    tryCatch({
      hba1c_counts <- values$clean_data %>%
        count(hba1c_category) %>%
        filter(!is.na(hba1c_category))

      # Create proper ordering: Normal → Prediabetic → Diabetic
      hba1c_order <- c("Normal", "Prediabetic", "Diabetic")
      hba1c_counts$hba1c_category <- factor(hba1c_counts$hba1c_category, levels = hba1c_order)

      # Use plot_ly directly with green → yellow → purple color scheme
      plot_ly(hba1c_counts, x = ~hba1c_category, y = ~n, type = 'bar',
              marker = list(color = c('#35b779', '#fde724', '#440154')),  # Green → Yellow → Purple
              hovertemplate = paste('<b>HbA1c Category:</b> %{x}<br>',
                                  '<b>Count:</b> %{y}<br>',
                                  '<extra></extra>')) %>%
        layout(title = "Distribution by HbA1c Category",
               xaxis = list(title = "HbA1c Category", categoryorder = "array", categoryarray = hba1c_order),
               yaxis = list(title = "Count"),
               showlegend = FALSE)
    }, error = function(e) {
      cat("Error in hba1cCategoryPlot:", e$message, "\n")
      return(NULL)
    })
  })

  # Summary statistics
  output$summaryStats <- DT::renderDataTable({
    req(values$clean_data)

    numeric_cols <- values$clean_data %>%
      select_if(is.numeric) %>%
      names()

    stats <- values$clean_data %>%
      select(all_of(numeric_cols)) %>%
      summarise_all(list(
        Mean = ~ round(mean(., na.rm = TRUE), 2),
        Median = ~ round(median(., na.rm = TRUE), 2),
        SD = ~ round(sd(., na.rm = TRUE), 2),
        Min = ~ min(., na.rm = TRUE),
        Max = ~ max(., na.rm = TRUE),
        Missing = ~ sum(is.na(.))
      )) %>%
      pivot_longer(everything()) %>%
      separate(name, into = c("Variable", "Statistic"), sep = "_(?=[^_]*$)") %>%
      pivot_wider(names_from = Statistic, values_from = value)

    stats
  }, options = list(scrollX = TRUE, pageLength = 10))

  # ========== TAB 3: DATA EXPLORATION ==========

  # Reactive values for filtered data in exploration tab
  values$exploration_filtered_data <- NULL

  # Initialize exploration filtered data
  observe({
    if (!is.null(values$combined_data)) {
      values$exploration_filtered_data <- values$combined_data

      # Update cohort summary with full data initially
      output$explorationCohortSummary <- renderText({
        data <- values$combined_data
        paste(
          sprintf("Exploration Cohort:"),
          sprintf("Total: %d participants", nrow(data)),
          sprintf("Males: %d, Females: %d",
                  sum(data$gender_label == "Male", na.rm = TRUE),
                  sum(data$gender_label == "Female", na.rm = TRUE)),
          sep = "\n"
        )
      })
    }
  })

  # Apply exploration cohort filters
  observeEvent(input$applyExplorationFilters, {
    req(values$combined_data)

    cat("\n[Exploration] Applying cohort filters...\n")
    filtered_data <- values$combined_data
    original_count <- nrow(filtered_data)

    # Apply filters
    if (!is.null(input$explorationAgeGroupFilter) && length(input$explorationAgeGroupFilter) > 0) {
      filtered_data <- filtered_data %>%
        filter(age_group_label %in% input$explorationAgeGroupFilter)
      cat("  → Age groups:", paste(input$explorationAgeGroupFilter, collapse=", "), "\n")
    }

    if (!is.null(input$explorationGenderFilter) && length(input$explorationGenderFilter) > 0) {
      filtered_data <- filtered_data %>%
        filter(gender_label %in% input$explorationGenderFilter)
      cat("  → Genders:", paste(input$explorationGenderFilter, collapse=", "), "\n")
    }

    if (!is.null(input$explorationHba1cFilter) && length(input$explorationHba1cFilter) > 0) {
      filtered_data <- filtered_data %>%
        filter(hba1c_category %in% input$explorationHba1cFilter)
      cat("  → HbA1c categories:", paste(input$explorationHba1cFilter, collapse=", "), "\n")
    }

    if (!is.null(input$explorationProviderFilter) && length(input$explorationProviderFilter) > 0) {
      filtered_data <- filtered_data %>%
        filter(Provider %in% input$explorationProviderFilter)
      cat("  → Providers:", paste(input$explorationProviderFilter, collapse=", "), "\n")
    }

    cat("  → Filtered:", original_count, "→", nrow(filtered_data), "participants\n")

    # Data type filter removed - now handled by column selection

    values$exploration_filtered_data <- filtered_data

    showNotification(
      paste0("Filters applied: ", nrow(filtered_data), " participants selected"),
      type = "message",
      duration = 3
    )

    # Update cohort summary with parameter count
    output$explorationCohortSummary <- renderText({
      # Count available parameters based on parameter type selection
      param_count <- 0
      if (!is.null(input$explorationParameterType) && !is.null(values$combined_data)) {
        if (!is.null(values$immune_data)) {
          immune_params <- get_immune_parameters(values$immune_data)
          param_types <- if(is.null(input$explorationParameterType)) c("blood", "immune") else input$explorationParameterType
          cell_types <- if(is.null(input$explorationImmuneCellType)) c("tcell", "bcell", "dendritic", "granulocyte") else input$explorationImmuneCellType
          available_cols <- filter_columns_by_parameter_type(values$combined_data, immune_params, param_types, cell_types)
          param_count <- length(available_cols) - 5  # Exclude metadata columns
        }
      }

      paste(
        sprintf("Filtered Exploration Cohort:"),
        sprintf("Participants: %d", nrow(filtered_data)),
        sprintf("Available parameters: %d", param_count),
        sprintf("Males: %d (%.1f%%)",
                sum(filtered_data$gender_label == "Male", na.rm = TRUE),
                100 * mean(filtered_data$gender_label == "Male", na.rm = TRUE)),
        sprintf("Females: %d (%.1f%%)",
                sum(filtered_data$gender_label == "Female", na.rm = TRUE),
                100 * mean(filtered_data$gender_label == "Female", na.rm = TRUE)),
        sep = "\n"
      )
    })
  })

  # Update column choices based on parameter type selection
  observeEvent(list(input$explorationParameterType, input$explorationImmuneCellType), {
    req(values$combined_data)
    # Don't require immune_data - filter function can work without it

    # Get immune parameters (will be NULL if no immune data)
    immune_params <- if(!is.null(values$immune_data)) get_immune_parameters(values$immune_data) else NULL

    # Filter columns based on parameter type and cell type selections
    param_types <- if(is.null(input$explorationParameterType)) c("blood", "immune") else input$explorationParameterType
    cell_types <- if(is.null(input$explorationImmuneCellType)) c("tcell", "bcell", "dendritic", "granulocyte") else input$explorationImmuneCellType
    available_cols <- filter_columns_by_parameter_type(values$combined_data, immune_params, param_types, cell_types)

    # For display in dropdown, create named choices if immune parameters are included
    if ("immune" %in% param_types && length(immune_params) > 0) {
      # Get actual immune columns that exist in available_cols
      actual_immune_cols <- as.character(immune_params)
      immune_in_available <- intersect(actual_immune_cols, available_cols)

      # Create display choices: use display names for immune, actual names for others
      display_choices <- available_cols
      names(display_choices) <- available_cols

      # Replace immune column names with their display names
      for (i in seq_along(immune_params)) {
        actual_col <- immune_params[i]
        display_name <- names(immune_params)[i]
        if (actual_col %in% display_choices) {
          names(display_choices)[display_choices == actual_col] <- display_name
        }
      }

      updateSelectInput(session, "column", choices = display_choices)
    } else {
      updateSelectInput(session, "column", choices = available_cols)
    }

    # Update color by choices (categorical)
    categorical_cols <- c("age_group_label", "gender_label", "hba1c_category")
    if ("blood" %in% param_types && "Provider" %in% names(values$combined_data)) {
      categorical_cols <- c(categorical_cols, "Provider")
    }
    updateSelectInput(session, "colorBy", choices = c("none", categorical_cols))
  })

  # Exploration plot - REWRITTEN to use plot_ly directly (no ggplotly)
  output$explorationPlot <- renderPlotly({
    req(values$exploration_filtered_data)
    req(input$column)

    df <- values$exploration_filtered_data

    # Handle custom grouping
    if (input$groupBy == "custom" && !is.null(input$customGroups)) {
      df <- df %>%
        mutate(temp_age_group = substr(Participant_ID, 1, 1)) %>%
        filter(temp_age_group %in% input$customGroups) %>%
        mutate(custom_group = case_when(
          length(input$customGroups) == 1 ~ age_group_label,
          TRUE ~ "Custom Combined"
        )) %>%
        select(-temp_age_group)
    }

    # Clean categorical variables
    df <- df %>%
      mutate(
        gender_label = case_when(
          grepl("Male|A", gender_label) ~ "Male",
          grepl("Female|B", gender_label) ~ "Female",
          TRUE ~ as.character(gender_label)
        ),
        hba1c_category = case_when(
          grepl("Normal", hba1c_category) ~ "Normal",
          grepl("Prediabetic", hba1c_category) ~ "Prediabetic",
          grepl("Diabetic", hba1c_category) ~ "Diabetic",
          TRUE ~ as.character(hba1c_category)
        )
      )

    # Remove outliers if requested
    if (input$removeOutliers && is.numeric(df[[input$column]])) {
      Q1 <- quantile(df[[input$column]], 0.25, na.rm = TRUE)
      Q3 <- quantile(df[[input$column]], 0.75, na.rm = TRUE)
      IQR <- Q3 - Q1
      df <- df %>%
        filter(.data[[input$column]] >= (Q1 - 1.5 * IQR) & .data[[input$column]] <= (Q3 + 1.5 * IQR))
    }

    # Determine grouping variable
    if (input$groupBy == "custom") {
      group_var <- "custom_group"
    } else if (input$groupBy != "none") {
      group_var <- input$groupBy
    } else {
      group_var <- NULL
    }

    # Get color palette based on color scheme selection
    color_palette <- NULL
    if (input$colorBy != "none") {
      n_colors <- length(unique(df[[input$colorBy]]))
      if (input$colorScheme %in% c("viridis", "plasma")) {
        # Viridis/Plasma palettes
        color_palette <- as.character(viridisLite::viridis(n_colors, option = input$colorScheme))
      } else if (input$colorScheme %in% c("Set1", "Dark2")) {
        # RColorBrewer palettes
        color_palette <- as.character(RColorBrewer::brewer.pal(min(9, max(3, n_colors)), input$colorScheme))
      } else if (input$colorScheme %in% names(wes_palettes)) {
        # Wes Anderson palettes - convert to character vector
        color_palette <- as.character(wes_palette(input$colorScheme, n_colors, type = "continuous"))
      }
    }

    # Create plot using plot_ly directly
    if (input$plotType == "box") {
      # Box plot
      if (!is.null(group_var)) {
        p <- plot_ly(df, x = as.formula(paste0("~", group_var)), y = as.formula(paste0("~`", input$column, "`")),
                type = "box", color = if(input$colorBy != "none") as.formula(paste0("~", input$colorBy)) else NULL,
                colors = color_palette, boxpoints = if(input$showPoints) "all" else FALSE) %>%
          layout(xaxis = list(title = group_var), yaxis = list(title = input$column))
      } else {
        p <- plot_ly(df, y = as.formula(paste0("~`", input$column, "`")), type = "box",
                color = if(input$colorBy != "none") as.formula(paste0("~", input$colorBy)) else NULL,
                colors = color_palette, boxpoints = if(input$showPoints) "all" else FALSE) %>%
          layout(xaxis = list(title = "All"), yaxis = list(title = input$column))
      }
    } else if (input$plotType == "violin") {
      # Violin plot
      if (!is.null(group_var)) {
        p <- plot_ly(df, x = as.formula(paste0("~", group_var)), y = as.formula(paste0("~`", input$column, "`")),
                type = "violin", color = if(input$colorBy != "none") as.formula(paste0("~", input$colorBy)) else NULL,
                colors = color_palette, box = list(visible = TRUE),
                meanline = list(visible = TRUE), points = if(input$showPoints) "all" else FALSE) %>%
          layout(xaxis = list(title = group_var), yaxis = list(title = input$column))
      } else {
        p <- plot_ly(df, y = as.formula(paste0("~`", input$column, "`")), type = "violin",
                color = if(input$colorBy != "none") as.formula(paste0("~", input$colorBy)) else NULL,
                colors = color_palette, box = list(visible = TRUE),
                meanline = list(visible = TRUE), points = if(input$showPoints) "all" else FALSE) %>%
          layout(xaxis = list(title = "All"), yaxis = list(title = input$column))
      }
    } else if (input$plotType == "histogram") {
      # Histogram
      p <- plot_ly(df, x = as.formula(paste0("~`", input$column, "`")), type = "histogram",
              color = if(input$colorBy != "none") as.formula(paste0("~", input$colorBy)) else NULL,
              colors = color_palette, alpha = 0.7) %>%
        layout(xaxis = list(title = input$column), yaxis = list(title = "Count"), barmode = "overlay")
    } else if (input$plotType == "density") {
      # Density plot (using histogram with very small bins as approximation)
      if (input$colorBy != "none") {
        # Split by color variable
        p <- plot_ly(alpha = 0.4) %>%
          add_trace(data = df, x = as.formula(paste0("~`", input$column, "`")),
                    color = as.formula(paste0("~", input$colorBy)), type = "histogram",
                    colors = color_palette, histnorm = "probability density") %>%
          layout(xaxis = list(title = input$column), yaxis = list(title = "Density"))
      } else {
        p <- plot_ly(df, x = as.formula(paste0("~`", input$column, "`")), type = "histogram",
                histnorm = "probability density", alpha = 0.4) %>%
          layout(xaxis = list(title = input$column), yaxis = list(title = "Density"))
      }
    }

    p
  })

  # Variable statistics
  output$variableStats <- renderText({
    req(values$clean_data)
    req(input$column)

    col_data <- values$clean_data[[input$column]]

    # Debug info for categorical variables
    debug_info <- ""
    if (input$colorBy != "none" && input$colorBy %in% names(values$clean_data)) {
      color_data <- values$clean_data[[input$colorBy]]
      debug_info <- paste(
        sprintf("\n--- DEBUG INFO ---"),
        sprintf("Color By Variable: %s", input$colorBy),
        sprintf("Unique Values: %s", paste(unique(color_data), collapse = ", ")),
        sprintf("Data Type: %s", class(color_data)),
        sep = "\n"
      )
    }

    if (is.numeric(col_data)) {
      paste(
        sprintf("Variable: %s", input$column),
        sprintf("Type: Numeric"),
        sprintf("Count: %d", length(col_data)),
        sprintf("Missing: %d (%.1f%%)", sum(is.na(col_data)), 100 * mean(is.na(col_data))),
        sprintf("Mean: %.2f", mean(col_data, na.rm = TRUE)),
        sprintf("Median: %.2f", median(col_data, na.rm = TRUE)),
        sprintf("SD: %.2f", sd(col_data, na.rm = TRUE)),
        sprintf("Range: %.2f - %.2f", min(col_data, na.rm = TRUE), max(col_data, na.rm = TRUE)),
        debug_info,
        sep = "\n"
      )
    } else {
      unique_vals <- unique(col_data)
      paste(
        sprintf("Variable: %s", input$column),
        sprintf("Type: Categorical"),
        sprintf("Count: %d", length(col_data)),
        sprintf("Missing: %d (%.1f%%)", sum(is.na(col_data)), 100 * mean(is.na(col_data))),
        sprintf("Unique values: %d", length(unique_vals)),
        sprintf("Values: %s", paste(head(unique_vals, 10), collapse = ", ")),
        debug_info,
        sep = "\n"
      )
    }
  })

  # PHASE 2: Correlation tab - filtered data with DEBOUNCING (500ms delay)
  correlation_filtered_data <- reactive({
    req(values$combined_data)

    filtered_data <- values$combined_data

    # Apply age group filter
    if (!is.null(input$correlationAgeGroupFilter) && length(input$correlationAgeGroupFilter) > 0) {
      filtered_data <- filtered_data %>%
        filter(age_group_label %in% input$correlationAgeGroupFilter)
    }

    # Apply gender filter
    if (!is.null(input$correlationGenderFilter) && length(input$correlationGenderFilter) > 0) {
      filtered_data <- filtered_data %>%
        filter(gender_label %in% input$correlationGenderFilter)
    }

    # Apply HbA1c filter
    if (!is.null(input$correlationHba1cFilter) && length(input$correlationHba1cFilter) > 0) {
      filtered_data <- filtered_data %>%
        filter(hba1c_category %in% input$correlationHba1cFilter)
    }

    # Apply provider filter
    if (!is.null(input$correlationProviderFilter) && length(input$correlationProviderFilter) > 0) {
      filtered_data <- filtered_data %>%
        filter(Provider %in% input$correlationProviderFilter)
    }

    return(filtered_data)
  }) %>% debounce(DEBOUNCE_MS)  # PHASE 2: Wait 500ms after last filter change before recalculating

  # Apply correlation filters
  observeEvent(input$applyCorrelationFilters, {
    cat("\n[Correlation] Applying cohort filters...\n")
    filtered_data <- correlation_filtered_data()
    cat("  → Filtered:", nrow(filtered_data), "participants\n")

    showNotification(
      paste0("Correlation filters applied: ", nrow(filtered_data), " participants"),
      type = "message",
      duration = 3
    )

    # Update cohort summary
    output$correlationCohortSummary <- renderText({
      paste(
        sprintf("Filtered Cohort Summary:"),
        sprintf("Total participants: %d", nrow(filtered_data)),
        sprintf("Males: %d (%.1f%%)",
                sum(filtered_data$gender_label == "Male", na.rm = TRUE),
                100 * mean(filtered_data$gender_label == "Male", na.rm = TRUE)),
        sprintf("Females: %d (%.1f%%)",
                sum(filtered_data$gender_label == "Female", na.rm = TRUE),
                100 * mean(filtered_data$gender_label == "Female", na.rm = TRUE)),
        sprintf("Age range: %.1f - %.1f years",
                min(filtered_data$Age, na.rm = TRUE),
                max(filtered_data$Age, na.rm = TRUE)),
        sep = "\n"
      )
    })
  })

  # Initialize correlation cohort summary
  observe({
    if (!is.null(values$combined_data)) {
      output$correlationCohortSummary <- renderText({
        data <- values$combined_data
        paste(
          sprintf("Current Cohort Summary:"),
          sprintf("Total participants: %d", nrow(data)),
          sprintf("Males: %d (%.1f%%)",
                  sum(data$gender_label == "Male", na.rm = TRUE),
                  100 * mean(data$gender_label == "Male", na.rm = TRUE)),
          sprintf("Females: %d (%.1f%%)",
                  sum(data$gender_label == "Female", na.rm = TRUE),
                  100 * mean(data$gender_label == "Female", na.rm = TRUE)),
          sprintf("Age range: %.1f - %.1f years",
                  min(data$Age, na.rm = TRUE),
                  max(data$Age, na.rm = TRUE)),
          sep = "\n"
        )
      })

      # Initialize provider filter choices
      if ("Provider" %in% names(values$combined_data)) {
        provider_choices <- unique(values$combined_data$Provider)
        updateCheckboxGroupInput(session, "correlationProviderFilter",
                                choices = provider_choices, selected = provider_choices)
      }
    }
  })

  # Correlation Heatmap
  output$correlationHeatmap <- renderPlotly({
    tryCatch({
      # Use filtered data from correlation tab
      filtered_data <- correlation_filtered_data()
      req(filtered_data)

      # Get immune parameters for filtering
      immune_params <- if(!is.null(values$immune_data)) get_immune_parameters(values$immune_data) else list()

      # Filter columns based on parameter type and cell type selection
      param_types <- if(is.null(input$correlationParameterType)) c("blood", "immune") else input$correlationParameterType
      cell_types <- if(is.null(input$correlationImmuneCellType)) c("tcell", "bcell", "dendritic", "granulocyte") else input$correlationImmuneCellType
      available_cols <- filter_columns_by_parameter_type(filtered_data, immune_params, param_types, cell_types)

      # Get only numeric columns for correlation from filtered columns
      numeric_data <- filtered_data %>%
        select(any_of(available_cols)) %>%
        select_if(is.numeric) %>%
        select(-any_of(c("Age")))  # Exclude Age as it's metadata

      if (ncol(numeric_data) < 2) {
        return(plotly_empty() %>%
          layout(title = list(text = "Need at least 2 numeric variables for correlation")))
      }

      # Remove columns that are entirely NA
      numeric_data <- numeric_data %>%
        select_if(~ !all(is.na(.)))

      # Remove columns with too few non-NA values (less than 3 observations)
      numeric_data <- numeric_data %>%
        select_if(~ sum(!is.na(.)) >= 3)

      if (ncol(numeric_data) < 2) {
        return(plotly_empty() %>%
          layout(title = list(text = "Need at least 2 variables with sufficient data for correlation")))
      }

      cat("Computing correlation for", ncol(numeric_data), "variables\n")
      cat("Column names:", paste(names(numeric_data), collapse = ", "), "\n")

      # Calculate correlation matrix using pairwise complete observations
      cor_method <- ifelse(is.null(input$correlationMethod), "spearman", input$correlationMethod)
      cor_matrix <- cor(numeric_data, use = "pairwise.complete.obs", method = cor_method)

      # Handle clustering if requested
      variable_order <- colnames(cor_matrix)
      if (!is.null(input$clusterCorrelation) && input$clusterCorrelation) {
        tryCatch({
          # Clean correlation matrix for clustering
          cor_matrix_clean <- cor_matrix

          # Replace NA, NaN, Inf values with 0 (no correlation)
          cor_matrix_clean[is.na(cor_matrix_clean) | is.nan(cor_matrix_clean) | is.infinite(cor_matrix_clean)] <- 0

          # Ensure diagonal is 1 (perfect self-correlation)
          diag(cor_matrix_clean) <- 1

          # Check if we have valid data for clustering
          if (any(is.na(cor_matrix_clean)) || any(is.infinite(cor_matrix_clean))) {
            stop("Still contains invalid values after cleaning")
          }

          # Create distance matrix from correlation (1 - |correlation|)
          dist_matrix <- as.dist(1 - abs(cor_matrix_clean))

          # Check distance matrix
          if (any(is.na(dist_matrix)) || any(is.infinite(dist_matrix))) {
            stop("Distance matrix contains invalid values")
          }

          # Perform hierarchical clustering
          cluster_method <- ifelse(is.null(input$clusterMethod), "complete", input$clusterMethod)
          hc <- hclust(dist_matrix, method = cluster_method)

          # Reorder variables based on clustering
          variable_order <- colnames(cor_matrix)[hc$order]

          cat("Clustering completed with method:", cluster_method, "\n")
          cat("Variable order:", paste(variable_order[1:min(5, length(variable_order))], collapse = ", "), "...\n")
        }, error = function(e) {
          cat("Clustering error:", e$message, "- using original order\n")
        })
      }

      # Reorder correlation matrix
      cor_matrix <- cor_matrix[variable_order, variable_order]

      # Apply minimum correlation filter
      min_cor <- ifelse(is.null(input$minCorrelation), 0, input$minCorrelation)

      # Set correlations below threshold to NA (but keep diagonal)
      cor_matrix_filtered <- cor_matrix
      cor_matrix_filtered[abs(cor_matrix) < min_cor & cor_matrix != 1] <- NA

      # Convert to long format for plotting
      cor_df <- expand.grid(Var1 = factor(rownames(cor_matrix_filtered), levels = variable_order),
                           Var2 = factor(colnames(cor_matrix_filtered), levels = rev(variable_order)))
      cor_df$Correlation <- as.vector(cor_matrix_filtered)

      # Remove NA values for filtered display
      cor_df <- cor_df[!is.na(cor_df$Correlation), ]

      # Create heatmap
      # Create heatmap with plot_ly directly
      show_values <- ifelse(is.null(input$showCorrValues), TRUE, input$showCorrValues)

      # Reshape data for heatmap
      cor_matrix_plot <- cor_matrix_filtered[rev(variable_order), variable_order]

      plot_ly(z = cor_matrix_plot,
              x = variable_order,
              y = rev(variable_order),
              type = "heatmap",
              colorscale = list(c(0, "blue"), c(0.5, "white"), c(1, "red")),
              zmin = -1, zmax = 1,
              text = if(show_values) round(cor_matrix_plot, 2) else NULL,
              texttemplate = if(show_values) "%{text}" else NULL,
              hovertemplate = "X: %{x}<br>Y: %{y}<br>Correlation: %{z:.2f}<extra></extra>",
              colorbar = list(title = paste(tools::toTitleCase(cor_method), "Correlation"))) %>%
        layout(xaxis = list(title = "Variables", tickangle = 45),
               yaxis = list(title = "Variables"),
               title = paste(tools::toTitleCase(cor_method), "Correlation Matrix"),
               hoverlabel = list(bgcolor = "white", bordercolor = "black"))

    }, error = function(e) {
      cat("Correlation heatmap error:", e$message, "\n")
      plotly_empty() %>%
        layout(title = list(text = paste("Error creating correlation plot:", e$message)))
    })
  })

  # Correlation summary
  output$correlationSummary <- renderText({
    tryCatch({
      filtered_data <- correlation_filtered_data()
      req(filtered_data)

      # Get immune parameters for filtering
      immune_params <- if(!is.null(values$immune_data)) get_immune_parameters(values$immune_data) else list()

      # Filter columns based on parameter type and cell type selection
      param_types <- if(is.null(input$correlationParameterType)) c("blood", "immune") else input$correlationParameterType
      cell_types <- if(is.null(input$correlationImmuneCellType)) c("tcell", "bcell", "dendritic", "granulocyte") else input$correlationImmuneCellType
      available_cols <- filter_columns_by_parameter_type(filtered_data, immune_params, param_types, cell_types)

      # Get only numeric columns
      numeric_data <- filtered_data %>%
        select(any_of(available_cols)) %>%
        select_if(is.numeric) %>%
        select(-any_of(c("Age")))

      if (ncol(numeric_data) < 2) {
        return("Need at least 2 numeric variables for correlation analysis")
      }

      # Calculate correlation matrix
      cor_method <- ifelse(is.null(input$correlationMethod), "spearman", input$correlationMethod)
      cor_matrix <- cor(numeric_data, use = "pairwise.complete.obs", method = cor_method)

      # Get summary statistics
      min_cor <- ifelse(is.null(input$minCorrelation), 0, input$minCorrelation)
      strong_correlations <- as.integer(sum(abs(cor_matrix) >= 0.7 & abs(cor_matrix) < 1, na.rm = TRUE) / 2)
      moderate_correlations <- as.integer(sum(abs(cor_matrix) >= 0.5 & abs(cor_matrix) < 0.7, na.rm = TRUE) / 2)
      weak_correlations <- as.integer(sum(abs(cor_matrix) >= 0.3 & abs(cor_matrix) < 0.5, na.rm = TRUE) / 2)

      paste(
        sprintf("Correlation Analysis Summary:"),
        sprintf("Variables analyzed: %d", ncol(numeric_data)),
        sprintf("Participants: %d", nrow(filtered_data)),
        sprintf("Method: %s", tools::toTitleCase(cor_method)),
        sprintf("Strong correlations (|r| ≥ 0.7): %d", strong_correlations),
        sprintf("Moderate correlations (0.5 ≤ |r| < 0.7): %d", moderate_correlations),
        sprintf("Weak correlations (0.3 ≤ |r| < 0.5): %d", weak_correlations),
        sprintf("Min correlation filter: %.2f", min_cor),
        sep = "\n"
      )
    }, error = function(e) {
      paste("Error generating summary:", e$message)
    })
  })

  # ========== REGRESSION PLOT (within Parameter Distribution tab) ==========

  # Update regression column choices based on exploration parameter type
  observeEvent(input$explorationParameterType, {
    req(values$combined_data)
    # Don't require immune_data - filter function can work without it

    # Get immune parameters (will be NULL if no immune data)
    immune_params <- if(!is.null(values$immune_data)) get_immune_parameters(values$immune_data) else NULL

    # Filter numeric columns based on parameter type and cell type (checkbox selection) for X/Y variables
    param_types <- if(is.null(input$explorationParameterType)) c("blood", "immune") else input$explorationParameterType
    cell_types <- if(is.null(input$explorationImmuneCellType)) c("tcell", "bcell", "dendritic", "granulocyte") else input$explorationImmuneCellType
    available_cols <- filter_columns_by_parameter_type(values$combined_data, immune_params, param_types, cell_types)
    numeric_cols <- values$combined_data %>%
      select(any_of(available_cols)) %>%
      select_if(is.numeric) %>%
      names()

    # For continuous color, include ALL numeric variables regardless of filter
    all_numeric_cols <- values$combined_data %>%
      select(-any_of(c("Participant_ID", "Provider", "Immune_Data_Available", "Data_Type"))) %>%
      select_if(is.numeric) %>%
      names()

    # Create display choices for X/Y variables (filtered)
    if ("immune" %in% param_types && length(immune_params) > 0) {
      # Get actual immune columns that are numeric and in available list
      actual_immune_cols <- as.character(immune_params)
      immune_numeric <- intersect(actual_immune_cols, numeric_cols)

      # Create display choices: use display names for immune, actual names for others
      display_choices <- numeric_cols
      names(display_choices) <- numeric_cols

      # Replace immune column names with their display names
      for (i in seq_along(immune_params)) {
        actual_col <- immune_params[i]
        display_name <- names(immune_params)[i]
        if (actual_col %in% display_choices) {
          names(display_choices)[display_choices == actual_col] <- display_name
        }
      }

      updateSelectInput(session, "xVariable", choices = display_choices)
      updateSelectInput(session, "yVariable", choices = display_choices)
    } else {
      updateSelectInput(session, "xVariable", choices = numeric_cols)
      updateSelectInput(session, "yVariable", choices = numeric_cols)
    }

    # Create ALL numeric choices for continuous color (unfiltered)
    all_display_choices <- all_numeric_cols
    names(all_display_choices) <- all_numeric_cols

    # Replace immune column names with their display names in ALL choices
    if (length(immune_params) > 0) {
      for (i in seq_along(immune_params)) {
        actual_col <- immune_params[i]
        display_name <- names(immune_params)[i]
        if (actual_col %in% all_display_choices) {
          names(all_display_choices)[all_display_choices == actual_col] <- display_name
        }
      }
    }

    updateSelectInput(session, "continuousColor", choices = all_display_choices)

    # Update categorical choices for color by
    categorical_cols <- c("age_group_label", "gender_label", "hba1c_category")
    if ("blood" %in% param_types && "Provider" %in% names(values$combined_data)) {
      categorical_cols <- c(categorical_cols, "Provider")
    }
    updateSelectInput(session, "regressionColorBy", choices = c("none", "continuous", categorical_cols))
  })

  # Scatter plot - REWRITTEN to use plot_ly directly
  output$scatterPlot <- renderPlotly({
    req(values$exploration_filtered_data)
    req(input$xVariable, input$yVariable)

    df <- values$exploration_filtered_data

    # Map display names to actual column names
    immune_params <- if(!is.null(values$immune_data)) get_immune_parameters(values$immune_data) else list()
    actual_x <- map_display_to_actual_names(input$xVariable, immune_params)[1]
    actual_y <- map_display_to_actual_names(input$yVariable, immune_params)[1]
    actual_color <- if(!is.null(input$continuousColor)) map_display_to_actual_names(input$continuousColor, immune_params)[1] else NULL

    # Create scatter plot with plot_ly directly
    # Use direct data vectors instead of formulas
    if (input$regressionColorBy == "continuous" && !is.null(input$continuousColor)) {
      p <- plot_ly(type = "scatter", mode = "markers") %>%
        add_trace(x = df[[actual_x]], y = df[[actual_y]],
                  marker = list(color = df[[actual_color]],
                               colorscale = "Viridis",
                               size = 8, opacity = 0.6,
                               showscale = TRUE,
                               colorbar = list(title = input$continuousColor)),
                  hovertemplate = paste0(input$xVariable, ": %{x:.2f}<br>",
                                        input$yVariable, ": %{y:.2f}<br>",
                                        input$continuousColor, ": %{marker.color:.2f}<extra></extra>"))
    } else if (input$regressionColorBy != "none" && input$regressionColorBy != "continuous") {
      # Categorical color variable
      if (input$regressionColorBy %in% names(df)) {
        p <- plot_ly(df, x = df[[actual_x]], y = df[[actual_y]],
                     color = as.factor(df[[input$regressionColorBy]]),
                     type = "scatter", mode = "markers",
                     marker = list(size = 8, opacity = 0.6),
                     hovertemplate = paste0(input$xVariable, ": %{x:.2f}<br>",
                                           input$yVariable, ": %{y:.2f}<extra></extra>"))
      } else {
        # Fallback if column doesn't exist
        p <- plot_ly(type = "scatter", mode = "markers") %>%
          add_trace(x = df[[actual_x]], y = df[[actual_y]],
                    marker = list(color = '#3498db', size = 8, opacity = 0.6),
                    hovertemplate = paste0(input$xVariable, ": %{x:.2f}<br>",
                                          input$yVariable, ": %{y:.2f}<extra></extra>"))
      }
    } else {
      p <- plot_ly(type = "scatter", mode = "markers") %>%
        add_trace(x = df[[actual_x]], y = df[[actual_y]],
                  marker = list(color = '#3498db', size = 8, opacity = 0.6),
                  hovertemplate = paste0(input$xVariable, ": %{x:.2f}<br>",
                                        input$yVariable, ": %{y:.2f}<extra></extra>"))
    }

    # Add regression line if requested
    if (input$showRegression) {
      # Remove NA values for regression
      df_clean <- df %>%
        filter(!is.na(.data[[actual_x]]) & !is.na(.data[[actual_y]]))

      # Check if we should fit separate lines per group
      if (input$regressionColorBy != "none" && input$regressionColorBy != "continuous" &&
          input$regressionColorBy %in% names(df_clean)) {
        # Fit separate regression for each category
        categories <- unique(df_clean[[input$regressionColorBy]])
        categories <- categories[!is.na(categories)]

        for (cat in categories) {
          df_cat <- df_clean %>% filter(.data[[input$regressionColorBy]] == cat)

          if (nrow(df_cat) >= 3) {  # Need at least 3 points for regression
            if (input$regressionType == "lm") {
              fit <- lm(as.formula(paste0("`", actual_y, "` ~ `", actual_x, "`")), data = df_cat)
              pred_data <- data.frame(x = df_cat[[actual_x]])
              names(pred_data) <- actual_x
              pred_data <- pred_data[order(pred_data[[1]]), , drop = FALSE]
              pred_data$y <- predict(fit, newdata = pred_data)

              # Add as independent trace with explicit data
              p <- p %>% add_lines(data = pred_data, x = pred_data[[1]], y = ~y,
                                   name = paste("Fit:", cat),
                                   line = list(width = 2),
                                   showlegend = FALSE,
                                   inherit = FALSE)
            } else if (input$regressionType == "loess") {
              fit <- loess(as.formula(paste0("`", actual_y, "` ~ `", actual_x, "`")), data = df_cat)
              pred_data <- data.frame(x = df_cat[[actual_x]])
              names(pred_data) <- actual_x
              pred_data <- pred_data[order(pred_data[[1]]), , drop = FALSE]
              pred_data$y <- predict(fit, newdata = pred_data)

              # Add as independent trace with explicit data
              p <- p %>% add_lines(data = pred_data, x = pred_data[[1]], y = ~y,
                                   name = paste("Fit:", cat),
                                   line = list(width = 2),
                                   showlegend = FALSE,
                                   inherit = FALSE)
            }
          }
        }
      } else {
        # Single regression line for all data
        if (input$regressionType == "lm") {
          fit <- lm(as.formula(paste0("`", actual_y, "` ~ `", actual_x, "`")), data = df_clean)
          pred_data <- data.frame(x = df_clean[[actual_x]])
          names(pred_data) <- actual_x
          pred_data <- pred_data[order(pred_data[[1]]), , drop = FALSE]
          pred_data$y <- predict(fit, newdata = pred_data)

          # Add as independent trace
          p <- p %>% add_lines(data = pred_data, x = pred_data[[1]], y = ~y,
                               name = "Linear Fit",
                               line = list(color = 'red', width = 2),
                               inherit = FALSE)
        } else if (input$regressionType == "loess") {
          fit <- loess(as.formula(paste0("`", actual_y, "` ~ `", actual_x, "`")), data = df_clean)
          pred_data <- data.frame(x = df_clean[[actual_x]])
          names(pred_data) <- actual_x
          pred_data <- pred_data[order(pred_data[[1]]), , drop = FALSE]
          pred_data$y <- predict(fit, newdata = pred_data)

          # Add as independent trace
          p <- p %>% add_lines(data = pred_data, x = pred_data[[1]], y = ~y,
                               name = "LOESS Fit",
                               line = list(color = 'red', width = 2),
                               inherit = FALSE)
        }
      }
    }

    p %>% layout(xaxis = list(title = input$xVariable),
                 yaxis = list(title = input$yVariable),
                 hoverlabel = list(bgcolor = "white", bordercolor = "black"))
  })

  # Correlation statistics
  output$correlationStats <- renderText({
    req(values$exploration_filtered_data)
    req(input$xVariable, input$yVariable)

    df <- values$exploration_filtered_data

    # Map display names to actual column names
    immune_params <- if(!is.null(values$immune_data)) get_immune_parameters(values$immune_data) else list()
    actual_x <- map_display_to_actual_names(input$xVariable, immune_params)[1]
    actual_y <- map_display_to_actual_names(input$yVariable, immune_params)[1]

    x_data <- df[[actual_x]]
    y_data <- df[[actual_y]]

    # Remove missing values for correlation
    complete_cases <- complete.cases(x_data, y_data)
    x_clean <- x_data[complete_cases]
    y_clean <- y_data[complete_cases]

    cor_pearson <- cor(x_clean, y_clean, method = "pearson")
    cor_spearman <- cor(x_clean, y_clean, method = "spearman")

    paste(
      sprintf("Variables: %s vs %s", input$xVariable, input$yVariable),
      sprintf("Complete cases: %d", sum(complete_cases)),
      sprintf("Pearson correlation: %.3f", cor_pearson),
      sprintf("Spearman correlation: %.3f", cor_spearman),
      sprintf("R-squared: %.3f", cor_pearson^2),
      sep = "\n"
    )
  })

  # Regression summary
  output$regressionSummary <- renderText({
    req(values$exploration_filtered_data)
    req(input$xVariable, input$yVariable)

    if (input$showRegression) {
      df <- values$exploration_filtered_data

      # Map display names to actual column names
      immune_params <- if(!is.null(values$immune_data)) get_immune_parameters(values$immune_data) else list()
      actual_x <- map_display_to_actual_names(input$xVariable, immune_params)[1]
      actual_y <- map_display_to_actual_names(input$yVariable, immune_params)[1]

      x_data <- df[[actual_x]]
      y_data <- df[[actual_y]]

      # Remove missing values
      complete_cases <- complete.cases(x_data, y_data)
      x_clean <- x_data[complete_cases]
      y_clean <- y_data[complete_cases]

      if (input$regressionType == "lm") {
        model <- lm(y_clean ~ x_clean)

        paste(
          "Linear Regression Summary:",
          sprintf("Intercept: %.3f", coef(model)[1]),
          sprintf("Slope: %.3f", coef(model)[2]),
          sprintf("R-squared: %.3f", summary(model)$r.squared),
          sprintf("P-value: %.3e", summary(model)$coefficients[2, 4]),
          sep = "\n"
        )
      } else {
        "Regression summary available for linear models only."
      }
    } else {
      "Enable regression line to see summary."
    }
  })

  # ========== TAB 5: PCA ANALYSIS ==========

  # Reactive values for PCA filtered data
  values$pca_filtered_data <- NULL

  # Initialize PCA filtered data
  observe({
    if (!is.null(values$combined_data)) {
      values$pca_filtered_data <- values$combined_data

      # Update cohort summary with full data initially
      output$pcaCohortSummary <- renderText({
        data <- values$combined_data
        paste(
          sprintf("PCA Cohort:"),
          sprintf("Total: %d participants", nrow(data)),
          sprintf("Males: %d, Females: %d",
                  sum(data$gender_label == "Male", na.rm = TRUE),
                  sum(data$gender_label == "Female", na.rm = TRUE)),
          sep = "\n"
        )
      })
    }
  })

  # Apply PCA cohort filters
  observeEvent(input$applyPCAFilters, {
    req(values$combined_data)

    cat("\n[PCA] Applying cohort filters...\n")
    filtered_data <- values$combined_data
    original_count <- nrow(filtered_data)

    # Apply age group filter
    if (!is.null(input$pcaAgeGroupFilter) && length(input$pcaAgeGroupFilter) > 0) {
      filtered_data <- filtered_data %>%
        filter(age_group_label %in% input$pcaAgeGroupFilter)
      cat("  → Age groups:", paste(input$pcaAgeGroupFilter, collapse=", "), "\n")
    }

    # Apply gender filter
    if (!is.null(input$pcaGenderFilter) && length(input$pcaGenderFilter) > 0) {
      filtered_data <- filtered_data %>%
        filter(gender_label %in% input$pcaGenderFilter)
      cat("  → Genders:", paste(input$pcaGenderFilter, collapse=", "), "\n")
    }

    # Apply HbA1c filter
    if (!is.null(input$pcaHbA1cFilter) && length(input$pcaHbA1cFilter) > 0) {
      filtered_data <- filtered_data %>%
        filter(hba1c_category %in% input$pcaHbA1cFilter)
      cat("  → HbA1c categories:", paste(input$pcaHbA1cFilter, collapse=", "), "\n")
    }

    # Apply provider filter
    if (!is.null(input$pcaProviderFilter) && length(input$pcaProviderFilter) > 0) {
      filtered_data <- filtered_data %>%
        filter(Provider %in% input$pcaProviderFilter)
      cat("  → Providers:", paste(input$pcaProviderFilter, collapse=", "), "\n")
    }

    cat("  → Filtered:", original_count, "→", nrow(filtered_data), "participants\n")
    values$pca_filtered_data <- filtered_data

    showNotification(
      paste0("PCA filters applied: ", nrow(filtered_data), " participants"),
      type = "message",
      duration = 3
    )

    # Update cohort summary with parameter count
    output$pcaCohortSummary <- renderText({
      # Count available parameters based on parameter type selection
      param_count <- 0
      if (!is.null(input$pcaParameterType) && !is.null(values$combined_data)) {
        if (!is.null(values$immune_data)) {
          immune_params <- get_immune_parameters(values$immune_data)
          param_types <- if(is.null(input$pcaParameterType)) c("blood", "immune") else input$pcaParameterType
          cell_types <- if(is.null(input$pcaImmuneCellType)) c("tcell", "bcell", "dendritic", "granulocyte") else input$pcaImmuneCellType
          available_cols <- filter_columns_by_parameter_type(values$combined_data, immune_params, param_types, cell_types)
          param_count <- length(available_cols) - 4  # Exclude metadata columns
        }
      }

      paste(
        sprintf("Filtered PCA Cohort:"),
        sprintf("Participants: %d", nrow(filtered_data)),
        sprintf("Available parameters: %d", param_count),
        sprintf("Males: %d (%.1f%%)",
                sum(filtered_data$gender_label == "Male", na.rm = TRUE),
                100 * mean(filtered_data$gender_label == "Male", na.rm = TRUE)),
        sprintf("Females: %d (%.1f%%)",
                sum(filtered_data$gender_label == "Female", na.rm = TRUE),
                100 * mean(filtered_data$gender_label == "Female", na.rm = TRUE)),
        sep = "\n"
      )
    })
  })

  # Update PCA column choices based on parameter type
  observeEvent(list(input$pcaParameterType, input$pcaImmuneCellType), {
    req(values$combined_data)
    # Don't require immune_data - filter function can work without it

    # Get immune parameters (will be NULL if no immune data)
    immune_params <- if(!is.null(values$immune_data)) get_immune_parameters(values$immune_data) else NULL

    # Filter numeric columns based on parameter type and cell type
    param_types <- if(is.null(input$pcaParameterType)) c("blood", "immune") else input$pcaParameterType
    cell_types <- if(is.null(input$pcaImmuneCellType)) c("tcell", "bcell", "dendritic", "granulocyte") else input$pcaImmuneCellType
    available_cols <- filter_columns_by_parameter_type(values$combined_data, immune_params, param_types, cell_types)
    numeric_cols <- values$combined_data %>%
      select(any_of(available_cols)) %>%
      select_if(is.numeric) %>%
      names()

    # Update continuous color choices
    updateSelectInput(session, "pcaContinuousColor", choices = numeric_cols)
  })

  # Run PCA
  observeEvent(input$runPCA, {
    req(values$pca_filtered_data)

    cat("\n========================================\n")
    cat("[PCA] Running PCA analysis...\n")
    cat("========================================\n")

    showNotification("Running PCA analysis...", type = "message", duration = 3)

    tryCatch({
      df <- values$pca_filtered_data

      # Debug: Show initial data info
      cat("→ Initial data dimensions:", nrow(df), "x", ncol(df), "\n")

      # Get parameter type selection
      param_types <- if(is.null(input$pcaParameterType)) c("blood", "immune") else input$pcaParameterType
      cat("Selected parameter types:", paste(param_types, collapse = ", "), "\n")

      # Filter rows based on data availability
      if ("immune" %in% param_types && !"blood" %in% param_types) {
        # Immune only: keep only participants with immune data
        df <- df %>% filter(Immune_Data_Available == TRUE)
        cat("Filtered to immune-data participants:", nrow(df), "rows\n")
      } else if ("blood" %in% param_types && !"immune" %in% param_types) {
        # Blood only: keep all participants (blood data is always available)
        cat("Using all participants for blood-only analysis\n")
      } else {
        # Both: keep all participants
        cat("Using all participants for combined analysis\n")
      }

      # Get columns based on parameter type and cell type selection
      # ALWAYS call filter function - it works directly with merged data columns
      cat("Calling column filter function...\n")
      cat("Parameter types selected:", paste(param_types, collapse = ", "), "\n")

      # immune_params is not actually needed - filter works with column patterns directly
      cell_types <- if(is.null(input$pcaImmuneCellType)) c("tcell", "bcell", "dendritic", "granulocyte") else input$pcaImmuneCellType
      available_cols <- filter_columns_by_parameter_type(df, immune_params = NULL, param_types, cell_types)

      # Debug: Check what columns are available and their types
      cat("Available columns after parameter filtering:", length(available_cols), "\n")

      selected_data <- df %>% select(any_of(available_cols))
      cat("Selected data dimensions:", nrow(selected_data), "x", ncol(selected_data), "\n")

      # Check column types
      col_types <- sapply(selected_data, class)
      cat("Column types summary:\n")
      cat("Numeric:", sum(sapply(selected_data, is.numeric)), "\n")
      cat("Character:", sum(sapply(selected_data, is.character)), "\n")
      cat("Logical:", sum(sapply(selected_data, is.logical)), "\n")
      cat("Factor:", sum(sapply(selected_data, is.factor)), "\n")

      # Show first few column types
      cat("First 10 column types:", paste(names(col_types)[1:min(10, length(col_types))], "(", col_types[1:min(10, length(col_types))], ")", collapse = ", "), "\n")

      # Select only numeric columns for PCA from available columns
      numeric_data <- selected_data %>%
        select_if(is.numeric) %>%
        select(-any_of(c("Age", "Participant_ID")))  # Exclude metadata

      # Debug: Show which columns were kept
      if (ncol(numeric_data) > 0) {
        cat("Numeric columns kept:", paste(head(names(numeric_data), 10), collapse = ", "), "\n")
      } else {
        cat("ERROR: No numeric columns found! Checking individual columns...\n")
        # Check each available column individually
        for (col in head(available_cols, 20)) {
          if (col %in% names(df)) {
            cat("Column", col, "- Type:", class(df[[col]]), "- Sample values:", paste(head(df[[col]], 3), collapse = ", "), "\n")
          } else {
            cat("Column", col, "- NOT FOUND in dataframe\n")
          }
        }
      }

      cat("Final numeric columns for PCA:", ncol(numeric_data), "\n")
      cat("Column names:", paste(head(names(numeric_data), 10), collapse = ", "), if(ncol(numeric_data) > 10) "..." else "", "\n")

      # Remove rows that are all NA for the selected parameters
      if (ncol(numeric_data) > 0) {
        rows_before <- nrow(numeric_data)
        # Keep track of valid row indices for metadata alignment
        valid_rows <- rowSums(!is.na(numeric_data)) > 0
        numeric_data <- numeric_data[valid_rows, , drop = FALSE]
        df <- df[valid_rows, , drop = FALSE]  # Keep df aligned with numeric_data
        cat("Removed", rows_before - nrow(numeric_data), "rows with all NA values\n")
        cat("Final data for PCA:", nrow(numeric_data), "participants x", ncol(numeric_data), "parameters\n")
      }

      # Check for constant columns or columns with all NAs
      constant_cols <- numeric_data %>%
        summarise_all(~ var(., na.rm = TRUE)) %>%
        select_if(~ is.na(.) | . == 0) %>%
        names()

      if (length(constant_cols) > 0) {
        cat("Removing constant/NA columns:", paste(constant_cols, collapse = ", "), "\n")
        numeric_data <- numeric_data %>%
          select(-all_of(constant_cols))
      }

      # Handle missing values
      cat("Missing values before handling:", sum(is.na(numeric_data)), "\n")
      cat("Rows with complete cases:", sum(complete.cases(numeric_data)), "\n")

      if (input$missingValues == "remove") {
        # First try to remove columns with too many missing values
        missing_prop <- colSums(is.na(numeric_data)) / nrow(numeric_data)
        keep_cols <- names(missing_prop[missing_prop < 0.5])  # Keep columns with <50% missing
        cat("Keeping", length(keep_cols), "columns with <50% missing values\n")

        if (length(keep_cols) > 1) {
          numeric_data <- numeric_data[, keep_cols, drop = FALSE]
          cat("After column filtering, missing values:", sum(is.na(numeric_data)), "\n")
        }

        # Then remove rows with remaining missing values
        numeric_data <- na.omit(numeric_data)
      } else if (input$missingValues == "mean") {
        numeric_data <- numeric_data %>%
          mutate_all(~ ifelse(is.na(.), mean(., na.rm = TRUE), .))
      } else if (input$missingValues == "median") {
        numeric_data <- numeric_data %>%
          mutate_all(~ ifelse(is.na(.), median(., na.rm = TRUE), .))
      }

      cat("Data dimensions after missing value handling:", nrow(numeric_data), "x", ncol(numeric_data), "\n")

      # Check if we have enough data
      if (nrow(numeric_data) < 2) {
        stop("Not enough observations after removing missing values (need at least 2)")
      }

      if (ncol(numeric_data) < 2) {
        stop("Not enough variables after preprocessing (need at least 2)")
      }

      # Remove low variance variables
      variances <- apply(numeric_data, 2, var, na.rm = TRUE)
      high_var_cols <- names(variances[variances > input$minVariance & !is.na(variances)])

      cat("Variables with sufficient variance:", length(high_var_cols), "\n")

      if (length(high_var_cols) < 2) {
        stop("Not enough variables with sufficient variance (need at least 2)")
      }

      numeric_data <- numeric_data[, high_var_cols, drop = FALSE]

      cat("Final data dimensions:", nrow(numeric_data), "x", ncol(numeric_data), "\n")

      # Metadata should already be aligned since we filtered df and numeric_data together
      processed_metadata <- df
      cat("Processed metadata dimensions:", nrow(processed_metadata), "x", ncol(processed_metadata), "\n")

      # Verify alignment
      if (nrow(processed_metadata) != nrow(numeric_data)) {
        stop("Metadata and numeric data dimensions don't match after filtering")
      }

      # Perform PCA
      pca_result <- prcomp(numeric_data,
                          scale. = input$scaleData,
                          center = input$centerData)

      values$pca_result <- pca_result
      values$pca_processed_data <- processed_metadata

      # Update PC choices
      pc_choices <- paste0("PC", 1:min(10, ncol(pca_result$x)))
      updateSelectInput(session, "pcX", choices = pc_choices, selected = "PC1")
      updateSelectInput(session, "pcY", choices = pc_choices, selected = "PC2")

      cat("PCA completed successfully!\n")
      showNotification("PCA analysis completed successfully!", type = "message")

    }, error = function(e) {
      error_msg <- paste("PCA Error:", e$message)
      cat("PCA Error:", e$message, "\n")
      cat("Error details:", toString(e), "\n")
      showNotification(error_msg, type = "error", duration = 10)
    })
  })

  # Scree plot
  output$screePlot <- renderPlotly({
    tryCatch({
      req(values$pca_result)

      variance_explained <- (values$pca_result$sdev^2) / sum(values$pca_result$sdev^2)

      variance_df <- data.frame(
        PC = 1:length(variance_explained),
        Variance = variance_explained
      ) %>%
        head(15)

      # Create plot_ly scree plot directly
      plot_ly(variance_df, x = ~PC, y = ~Variance, type = 'scatter', mode = 'lines+markers',
              line = list(color = '#3498db'), marker = list(color = '#3498db', size = 8)) %>%
        layout(xaxis = list(title = "Principal Component"),
               yaxis = list(title = "Proportion of Variance Explained"),
               title = "Scree Plot",
               hoverlabel = list(bgcolor = "white", bordercolor = "black"))
    }, error = function(e) {
      cat("Scree plot error:", e$message, "\n")
      plotly_empty() %>%
        layout(title = list(text = paste("Error creating scree plot:", e$message)))
    })
  })

  # Variance explained table
  output$varianceTable <- DT::renderDataTable({
    req(values$pca_result)

    variance_explained <- (values$pca_result$sdev^2) / sum(values$pca_result$sdev^2)
    cumulative_variance <- cumsum(variance_explained)

    data.frame(
      PC = paste0("PC", 1:length(variance_explained)),
      Variance = round(variance_explained, 4),
      Cumulative = round(cumulative_variance, 4)
    ) %>%
      head(15)
  }, options = list(pageLength = 10))

  # PCA Biplot
  output$pcaBiplot <- renderPlotly({
    tryCatch({
      req(values$pca_result)
      req(input$pcX, input$pcY)
      req(values$pca_processed_data)

      pc_x_num <- as.numeric(gsub("PC", "", input$pcX))
      pc_y_num <- as.numeric(gsub("PC", "", input$pcY))

      # Get PC scores and match with metadata
      pc_scores <- data.frame(values$pca_result$x[, c(pc_x_num, pc_y_num)])
      names(pc_scores) <- c("PC_X", "PC_Y")

      # Add metadata using the processed data that matches PCA rows
      if (input$pcaColorBy == "continuous") {
        req(input$pcaContinuousColor)
        pc_scores$color_var <- values$pca_processed_data[[input$pcaContinuousColor]]
        color_label <- input$pcaContinuousColor
      } else {
        pc_scores$color_var <- values$pca_processed_data[[input$pcaColorBy]]
        color_label <- input$pcaColorBy
      }

      # Check if color variable is continuous (numeric) or categorical
      is_continuous <- is.numeric(pc_scores$color_var)

      # Calculate variance explained for axis labels
      x_var_exp <- round(100 * (values$pca_result$sdev[pc_x_num]^2) / sum(values$pca_result$sdev^2), 1)
      y_var_exp <- round(100 * (values$pca_result$sdev[pc_y_num]^2) / sum(values$pca_result$sdev^2), 1)

      # Create PCA biplot with plot_ly directly
      if (is_continuous) {
        # Get color scale
        color_scale <- ifelse(is.null(input$pcaColorScale), "viridis", input$pcaColorScale)

        # Get appropriate color palette
        if (color_scale %in% c("viridis", "plasma", "inferno", "magma", "cividis")) {
          colors <- viridisLite::viridis(100, option = color_scale)
        } else if (color_scale == "blue_red") {
          colors <- colorRampPalette(c("blue", "white", "red"))(100)
        } else if (color_scale == "red_blue") {
          colors <- colorRampPalette(c("red", "white", "blue"))(100)
        } else {
          colors <- viridisLite::viridis(100)
        }

        plot_ly(pc_scores, x = ~PC_X, y = ~PC_Y, color = ~color_var,
                colors = colors, type = "scatter", mode = "markers",
                marker = list(size = 8, opacity = 0.6),
                text = ~paste("Color:", round(color_var, 2)),
                hovertemplate = paste0(input$pcX, ": %{x:.2f}<br>",
                                      input$pcY, ": %{y:.2f}<br>",
                                      color_label, ": %{text}<extra></extra>"))
      } else {
        # Categorical coloring
        colors <- as.character(wesanderson::wes_palette("Darjeeling1",
                                                        length(unique(pc_scores$color_var)),
                                                        type = "continuous"))

        plot_ly(pc_scores, x = ~PC_X, y = ~PC_Y, color = ~as.factor(color_var),
                colors = colors, type = "scatter", mode = "markers",
                marker = list(size = 8, opacity = 0.6),
                hovertemplate = paste0(input$pcX, ": %{x:.2f}<br>",
                                      input$pcY, ": %{y:.2f}<br>",
                                      color_label, ": %{fullData.name}<extra></extra>"))
      } %>%
        layout(xaxis = list(title = paste0(input$pcX, " (", x_var_exp, "%)")),
               yaxis = list(title = paste0(input$pcY, " (", y_var_exp, "%)")),
               title = "PCA Biplot",
               legend = list(title = list(text = color_label)),
               hoverlabel = list(bgcolor = "white", bordercolor = "black"))
    }, error = function(e) {
      cat("PCA biplot error:", e$message, "\n")
      plotly_empty() %>%
        layout(title = list(text = paste("Error creating PCA biplot:", e$message)))
    })
  })

  # Variable loadings table
  output$loadingsTable <- DT::renderDataTable({
    req(values$pca_result)
    req(input$pcX, input$pcY)

    pc_x_num <- as.numeric(gsub("PC", "", input$pcX))
    pc_y_num <- as.numeric(gsub("PC", "", input$pcY))

    loadings <- data.frame(
      Variable = rownames(values$pca_result$rotation),
      PC_X = values$pca_result$rotation[, pc_x_num],
      PC_Y = values$pca_result$rotation[, pc_y_num]
    )

    names(loadings)[2:3] <- c(input$pcX, input$pcY)

    loadings %>%
      mutate_if(is.numeric, ~ round(., 3)) %>%
      arrange(desc(abs(.data[[input$pcX]])))

  }, options = list(pageLength = 15, scrollX = TRUE))

  # PC-Metadata Correlation Plot
  output$pcaCorrelationPlot <- renderPlotly({
    tryCatch({
      req(values$pca_result)
      req(values$pca_processed_data)

      # Get PC scores (first 10 PCs or all if less)
      n_pcs <- min(10, ncol(values$pca_result$x))
      pc_scores <- data.frame(values$pca_result$x[, 1:n_pcs])

      # Get metadata variables
      metadata_vars <- c("age_group_label", "gender_label", "hba1c_category", "Provider", "Age")
      available_metadata <- metadata_vars[metadata_vars %in% names(values$pca_processed_data)]

      # Calculate correlations
      correlations <- matrix(nrow = length(available_metadata), ncol = n_pcs)
      rownames(correlations) <- available_metadata
      colnames(correlations) <- paste0("PC", 1:n_pcs)

      for (i in seq_along(available_metadata)) {
        var_name <- available_metadata[i]
        var_data <- values$pca_processed_data[[var_name]]

        if (is.numeric(var_data)) {
          # Direct correlation for numeric variables
          for (j in 1:n_pcs) {
            correlations[i, j] <- cor(pc_scores[, j], var_data, use = "complete.obs")
          }
        } else {
          # For categorical variables, use eta-squared (correlation ratio)
          for (j in 1:n_pcs) {
            # Convert to numeric if it's a factor
            if (is.factor(var_data)) {
              numeric_var <- as.numeric(var_data)
            } else {
              # Create dummy encoding for character variables
              unique_vals <- unique(var_data[!is.na(var_data)])
              numeric_var <- match(var_data, unique_vals)
            }
            correlations[i, j] <- cor(pc_scores[, j], numeric_var, use = "complete.obs")
          }
        }
      }

      # Convert to data frame for plotting
      cor_df <- expand.grid(Metadata = rownames(correlations),
                           PC = colnames(correlations))
      cor_df$Correlation <- as.vector(correlations)

      # Create heatmap with plot_ly directly
      plot_ly(z = correlations,
              x = colnames(correlations),
              y = rownames(correlations),
              type = "heatmap",
              colorscale = list(c(0, "blue"), c(0.5, "white"), c(1, "red")),
              zmin = -1, zmax = 1,
              text = round(correlations, 2),
              texttemplate = "%{text}",
              hovertemplate = "PC: %{x}<br>Metadata: %{y}<br>Correlation: %{z:.2f}<extra></extra>",
              colorbar = list(title = "Correlation")) %>%
        layout(xaxis = list(title = "Principal Components", tickangle = 45),
               yaxis = list(title = "Metadata Variables"),
               title = "Principal Components vs Metadata Correlations",
               hoverlabel = list(bgcolor = "white", bordercolor = "black"))

    }, error = function(e) {
      cat("PC-Metadata correlation plot error:", e$message, "\n")
      plotly_empty() %>%
        layout(title = list(text = paste("Error creating correlation plot:", e$message)))
    })
  })

  # ========== TAB 6: MULTIVARIABLE ANALYSIS ==========

  # Reactive value for filtered data - initialize with full data when available
  values$filtered_data <- NULL

  # Initialize filtered data when combined_data is loaded
  observe({
    if (!is.null(values$combined_data)) {
      values$filtered_data <- values$combined_data

      # Update cohort summary with full data initially
      output$cohortSummary <- renderText({
        data <- values$combined_data
        paste(
          sprintf("Current Cohort Summary:"),
          sprintf("Total participants: %d", nrow(data)),
          sprintf("Males: %d (%.1f%%)",
                  sum(data$gender_label == "Male", na.rm = TRUE),
                  100 * mean(data$gender_label == "Male", na.rm = TRUE)),
          sprintf("Females: %d (%.1f%%)",
                  sum(data$gender_label == "Female", na.rm = TRUE),
                  100 * mean(data$gender_label == "Female", na.rm = TRUE)),
          sprintf("Age range: %.1f - %.1f years",
                  min(data$Age, na.rm = TRUE),
                  max(data$Age, na.rm = TRUE)),
          sep = "\n"
        )
      })
    }
  })

  # Apply cohort filters
  observeEvent(input$applyFilters, {
    req(values$combined_data)

    filtered_data <- values$combined_data

    # Apply age group filter
    if (!is.null(input$ageGroupFilter) && length(input$ageGroupFilter) > 0) {
      filtered_data <- filtered_data %>%
        filter(age_group_label %in% input$ageGroupFilter)
    }

    # Apply gender filter
    if (!is.null(input$genderFilter) && length(input$genderFilter) > 0) {
      filtered_data <- filtered_data %>%
        filter(gender_label %in% input$genderFilter)
    }

    # Apply HbA1c filter
    if (!is.null(input$hba1cFilter) && length(input$hba1cFilter) > 0) {
      filtered_data <- filtered_data %>%
        filter(hba1c_category %in% input$hba1cFilter)
    }

    # Apply provider filter
    if (!is.null(input$providerFilter) && length(input$providerFilter) > 0) {
      filtered_data <- filtered_data %>%
        filter(Provider %in% input$providerFilter)
    }

    # Data type filter removed - now handled by column selection

    values$filtered_data <- filtered_data

    # Update cohort summary
    output$cohortSummary <- renderText({
      paste(
        sprintf("Filtered Cohort Summary:"),
        sprintf("Total participants: %d", nrow(filtered_data)),
        sprintf("Males: %d (%.1f%%)",
                sum(filtered_data$gender_label == "Male", na.rm = TRUE),
                100 * mean(filtered_data$gender_label == "Male", na.rm = TRUE)),
        sprintf("Females: %d (%.1f%%)",
                sum(filtered_data$gender_label == "Female", na.rm = TRUE),
                100 * mean(filtered_data$gender_label == "Female", na.rm = TRUE)),
        sprintf("Age range: %.1f - %.1f years",
                min(filtered_data$Age, na.rm = TRUE),
                max(filtered_data$Age, na.rm = TRUE)),
        sep = "\n"
      )
    })
  })

  # Update multivariable column choices based on parameter type
  observeEvent(list(input$multivariableParameterType, input$multivariableImmuneCellType), {
    req(values$combined_data)
    # Don't require immune_data - filter function can work without it

    # Get immune parameters (will be NULL if no immune data)
    immune_params <- if(!is.null(values$immune_data)) get_immune_parameters(values$immune_data) else NULL

    # Filter numeric columns based on parameter type and cell type (checkbox selection)
    param_types <- if(is.null(input$multivariableParameterType)) c("blood", "immune") else input$multivariableParameterType
    cell_types <- if(is.null(input$multivariableImmuneCellType)) c("tcell", "bcell", "dendritic", "granulocyte") else input$multivariableImmuneCellType
    available_cols <- filter_columns_by_parameter_type(values$combined_data, immune_params, param_types, cell_types)
    numeric_cols <- values$combined_data %>%
      select(any_of(available_cols)) %>%
      select_if(is.numeric) %>%
      names()

    # Create display choices for numeric columns
    if ("immune" %in% param_types && length(immune_params) > 0) {
      # Get actual immune columns that are numeric and in available list
      actual_immune_cols <- as.character(immune_params)
      immune_numeric <- intersect(actual_immune_cols, numeric_cols)

      # Create display choices: use display names for immune, actual names for others
      display_choices <- numeric_cols
      names(display_choices) <- numeric_cols

      # Replace immune column names with their display names
      for (i in seq_along(immune_params)) {
        actual_col <- immune_params[i]
        display_name <- names(immune_params)[i]
        if (actual_col %in% display_choices) {
          names(display_choices)[display_choices == actual_col] <- display_name
        }
      }

      # Update choices with display names
      updateSelectInput(session, "outcomeVar", choices = display_choices)
      biomarker_display <- display_choices[!display_choices %in% c("Age")]  # Exclude Age
      updateSelectInput(session, "biochemPredictors", choices = biomarker_display)
      updateSelectInput(session, "pcaContinuousColor", choices = display_choices)
    } else {
      updateSelectInput(session, "outcomeVar", choices = numeric_cols)
      biomarker_cols <- numeric_cols[!numeric_cols %in% c("Age")]  # Exclude Age from biomarkers
      updateSelectInput(session, "biochemPredictors", choices = biomarker_cols)
      updateSelectInput(session, "pcaContinuousColor", choices = numeric_cols)
    }

    # Update custom predictor choices (including categorical)
    categorical_cols <- c("age_group_label", "gender_label", "hba1c_category")
    if ("blood" %in% param_types && "Provider" %in% names(values$combined_data)) {
      categorical_cols <- c(categorical_cols, "Provider")
    }

    # For custom predictor, combine numeric display choices with categorical
    if ("immune" %in% param_types && length(immune_params) > 0) {
      all_display_cols <- c(display_choices, categorical_cols)
      updateSelectInput(session, "customPredictor", choices = all_display_cols)
    } else {
      all_cols <- c(numeric_cols, categorical_cols)
      updateSelectInput(session, "customPredictor", choices = all_cols)
    }
  })

  # Run multivariable regression to find best predictors
  observeEvent(input$runMultiRegression, {
    req(values$filtered_data)
    req(input$outcomeVar)

    cat("\n========================================\n")
    cat("[Multivariable] Running regression...\n")
    cat("========================================\n")

    showNotification("Running multivariable analysis...", type = "message", duration = 3)

    tryCatch({
      # Get data to use
      data_to_use <- values$filtered_data
      cat("→ Using", nrow(data_to_use), "participants\n")

      # Map display names to actual column names
      immune_params <- if(!is.null(values$immune_data)) get_immune_parameters(values$immune_data) else list()
      actual_outcome <- map_display_to_actual_names(input$outcomeVar, immune_params)
      outcome <- actual_outcome[1]  # Get the first (and only) mapped name
      cat("→ Outcome variable:", outcome, "\n")

      # Check if outcome exists in data
      if (!outcome %in% names(data_to_use)) {
        cat("✗ ERROR: Outcome variable", outcome, "not found in data\n")
        stop(paste("Outcome variable", outcome, "not found in data"))
      }

      # Get biomarker predictors
      if (input$includeAllBiomarkers) {
        # Use all available biomarkers based on parameter type and cell type selection
        param_types <- if(is.null(input$multivariableParameterType)) c("blood", "immune") else input$multivariableParameterType
        cell_types <- if(is.null(input$multivariableImmuneCellType)) c("tcell", "bcell", "dendritic", "granulocyte") else input$multivariableImmuneCellType
        available_cols <- filter_columns_by_parameter_type(data_to_use, immune_params, param_types, cell_types)
        numeric_cols <- data_to_use %>%
          select(any_of(available_cols)) %>%
          select_if(is.numeric) %>%
          names()
        biomarkers <- numeric_cols[!numeric_cols %in% c("Age", outcome)]
      } else {
        # Use selected biomarkers (map display names to actual names)
        req(input$biochemPredictors)
        actual_biomarkers <- map_display_to_actual_names(input$biochemPredictors, immune_params)
        biomarkers <- actual_biomarkers[actual_biomarkers != outcome]
      }

      if (length(biomarkers) == 0) {
        stop("No biomarker predictors selected")
      }

      # Add confounders (excluding the outcome variable)
      predictors <- biomarkers
      if (!is.null(input$confounders) && length(input$confounders) > 0) {
        confounders_to_add <- input$confounders[input$confounders != outcome]
        if (length(confounders_to_add) > 0) {
          # Check if confounders exist in data
          valid_confounders <- confounders_to_add[confounders_to_add %in% names(data_to_use)]
          if (length(valid_confounders) > 0) {
            predictors <- c(predictors, valid_confounders)
          }
        }
      }

      # Remove duplicates
      predictors <- unique(predictors)

      # Check data availability
      cat("Initial data:", nrow(data_to_use), "observations\n")
      cat("Selected predictors:", length(predictors), "\n")
      cat("Missing data method:", input$missingDataMethod, "\n")

      # Check missingness for each variable
      missing_counts <- sapply(data_to_use[, c(outcome, predictors)], function(x) sum(is.na(x)))
      cat("Missing values per variable:\n")
      print(missing_counts[missing_counts > 0])

      # Handle missing data based on selected method
      missing_method <- ifelse(is.null(input$missingDataMethod), "complete", input$missingDataMethod)

      if (missing_method == "complete") {
        # Complete cases only (original approach)
        complete_cases <- complete.cases(data_to_use[, c(outcome, predictors)])
        data_for_model <- data_to_use[complete_cases, ]

        if (nrow(data_for_model) < 10) {
          stop(paste("Insufficient complete cases:", nrow(data_for_model),
                    "Try a different missing data method"))
        }
      } else if (missing_method %in% c("lm_mean", "lm_median", "lm_mode")) {
        # Imputation methods for linear regression
        data_for_model <- data_to_use

        # Impute missing values
        for (col in c(outcome, predictors)) {
          if (col %in% names(data_for_model) && any(is.na(data_for_model[[col]]))) {
            if (is.numeric(data_for_model[[col]])) {
              if (missing_method == "lm_mean") {
                data_for_model[[col]][is.na(data_for_model[[col]])] <- mean(data_for_model[[col]], na.rm = TRUE)
              } else if (missing_method == "lm_median") {
                data_for_model[[col]][is.na(data_for_model[[col]])] <- median(data_for_model[[col]], na.rm = TRUE)
              }
            } else {
              # Mode imputation for categorical variables
              mode_val <- names(sort(table(data_for_model[[col]]), decreasing = TRUE))[1]
              data_for_model[[col]][is.na(data_for_model[[col]])] <- mode_val
            }
          }
        }
        cat("Imputation completed using method:", missing_method, "\n")
      } else {
        # Use full dataset for methods that handle missing data
        data_for_model <- data_to_use
      }

      # Create formula with proper escaping for special characters
      escaped_outcome <- paste0("`", outcome, "`")
      escaped_predictors <- paste0("`", predictors, "`")
      formula_str <- paste(escaped_outcome, "~", paste(escaped_predictors, collapse = " + "))
      cat("Running regression:", formula_str, "\n")
      cat("Using", nrow(data_for_model), "complete observations\n")

      # Run regression based on missing data method
      if (missing_method == "randomforest") {
        # Random Forest handles missing data natively
        if (!require(randomForest, quietly = TRUE)) {
          stop("randomForest package required. Please install it.")
        }

        # Prepare data for random forest
        rf_data <- data_for_model[, c(outcome, predictors)]

        if (outcome == "Age") {
          # Regression forest for continuous outcome
          model <- randomForest(as.formula(formula_str), data = rf_data, na.action = na.roughfix,
                               importance = TRUE, ntree = 500)
          model_summary <- model
          regression_type <- "randomforest_reg"
        } else {
          # Classification forest for categorical outcome
          rf_data[[outcome]] <- as.factor(rf_data[[outcome]])
          model <- randomForest(as.formula(formula_str), data = rf_data, na.action = na.roughfix,
                               importance = TRUE, ntree = 500)
          model_summary <- model
          regression_type <- "randomforest_class"
        }

      } else if (missing_method == "glmnet") {
        # Elastic Net with missing data handling
        if (!require(glmnet, quietly = TRUE)) {
          stop("glmnet package required. Please install it.")
        }

        # Prepare matrices (glmnet uses matrix input)
        x_data <- data_for_model[, predictors, drop = FALSE]
        y_data <- data_for_model[[outcome]]

        # Convert categorical predictors to dummy variables if needed
        if (any(sapply(x_data, function(x) !is.numeric(x)))) {
          x_data <- model.matrix(~ . - 1, data = x_data)
        } else {
          x_data <- as.matrix(x_data)
        }

        if (outcome == "Age") {
          # Gaussian family for continuous outcome
          model <- cv.glmnet(x_data, y_data, family = "gaussian", alpha = 0.5)
          regression_type <- "glmnet_reg"
        } else if (outcome == "gender_label") {
          # Binomial for binary outcome
          y_data <- as.factor(y_data)
          model <- cv.glmnet(x_data, y_data, family = "binomial", alpha = 0.5)
          regression_type <- "glmnet_bin"
        } else {
          # Multinomial for categorical outcome
          y_data <- as.factor(y_data)
          model <- cv.glmnet(x_data, y_data, family = "multinomial", alpha = 0.5)
          regression_type <- "glmnet_multi"
        }
        model_summary <- model

      } else {
        # Traditional regression methods or imputed regression
        regression_type <- "lm"  # default for continuous
        if (outcome %in% c("gender_label", "hba1c_category", "age_group_label", "Provider")) {
          regression_type <- "multinom"  # multinomial for categorical
          if (outcome == "gender_label") {
            regression_type <- "glm"  # binomial for binary
          }
        }

        # Add imputation suffix if using imputation
        if (missing_method %in% c("lm_mean", "lm_median", "lm_mode")) {
          regression_type <- paste0(regression_type, "_imputed")
        }

        # Run appropriate regression
        if (grepl("lm", regression_type)) {
          model <- lm(as.formula(formula_str), data = data_for_model)
          model_summary <- summary(model)
        } else if (grepl("glm", regression_type)) {
          model <- glm(as.formula(formula_str), data = data_for_model, family = binomial())
          model_summary <- summary(model)
        } else {
          # For multinomial regression
          if (!require(nnet, quietly = TRUE)) {
            stop("nnet package required for categorical outcomes")
          }
          model <- nnet::multinom(as.formula(formula_str), data = data_for_model, trace = FALSE)
          model_summary <- summary(model)
        }
      }

      # Determine method name for display
      method_name <- case_when(
        regression_type == "lm" ~ "Linear Regression",
        regression_type == "lm_imputed" ~ "Linear Regression (Imputed)",
        regression_type == "glm" ~ "Logistic Regression",
        regression_type == "glm_imputed" ~ "Logistic Regression (Imputed)",
        regression_type == "multinom" ~ "Multinomial Regression",
        regression_type == "multinom_imputed" ~ "Multinomial Regression (Imputed)",
        regression_type == "randomforest_reg" ~ "Random Forest (Regression)",
        regression_type == "randomforest_class" ~ "Random Forest (Classification)",
        regression_type == "glmnet_reg" ~ "Elastic Net (Regression)",
        regression_type == "glmnet_bin" ~ "Elastic Net (Binary)",
        regression_type == "glmnet_multi" ~ "Elastic Net (Multinomial)",
        TRUE ~ regression_type
      )

      # Store model for plotting
      values$multi_model <- model
      values$model_data <- data_for_model
      values$model_formula <- formula_str
      values$regression_type <- regression_type
      values$method_name <- method_name

      # Update model info
      output$modelInfo <- renderText({
        paste(
          sprintf("Predicting: %s", outcome),
          sprintf("Using %d biomarkers", length(biomarkers)),
          sprintf("Method: %s", method_name),
          sprintf("Missing data: %s", missing_method),
          sprintf("Total observations: %d", nrow(data_for_model)),
          sep = "\n"
        )
      })

      # Display results
      output$regressionSummary <- renderText({
        result <- capture.output({
          cat("--- Model Information ---\n")
          cat("Predicting:", outcome, "\n")
          cat("Method:", method_name, "\n")
          cat("Observations used:", nrow(data_for_model), "\n")
          cat("Number of biomarker predictors:", length(biomarkers), "\n")

          if (grepl("randomforest", regression_type)) {
            # Random Forest results
            print(model)
            cat("\n--- Variable Importance ---\n")
            importance_df <- importance(model)
            if (regression_type == "randomforest_reg") {
              # Sort by %IncMSE for regression
              importance_sorted <- importance_df[order(importance_df[,1], decreasing = TRUE), , drop = FALSE]
            } else {
              # Sort by MeanDecreaseGini for classification
              importance_sorted <- importance_df[order(importance_df[,ncol(importance_df)], decreasing = TRUE), , drop = FALSE]
            }
            print(head(importance_sorted, 10))

          } else if (grepl("glmnet", regression_type)) {
            # Elastic Net results
            cat("Lambda min:", model$lambda.min, "\n")
            cat("Lambda 1se:", model$lambda.1se, "\n")

            # Get coefficients at lambda.1se
            coeffs <- coef(model, s = "lambda.1se")
            if (is.list(coeffs)) {
              # Multinomial - show first class
              coeffs <- coeffs[[1]]
            }

            # Show non-zero coefficients
            non_zero <- which(coeffs != 0)
            if (length(non_zero) > 1) {  # Exclude intercept
              cat("\n--- Selected Variables (non-zero coefficients) ---\n")
              selected_vars <- coeffs[non_zero]
              for (i in names(selected_vars)) {
                if (i != "(Intercept)") {
                  cat(sprintf("%s: %.3f\n", i, selected_vars[[i]]))
                }
              }
            }

          } else {
            # Traditional regression results
            print(model_summary)

            if (regression_type == "lm") {
              cat("R-squared:", round(model_summary$r.squared, 4), "\n")
              cat("Adjusted R-squared:", round(model_summary$adj.r.squared, 4), "\n")

              # Show most significant predictors
              coeffs <- model_summary$coefficients
              p_values <- coeffs[, 4]
              significant <- p_values < 0.05
              if (any(significant)) {
                cat("\nSignificant predictors (p < 0.05):\n")
                sig_coeffs <- coeffs[significant, , drop = FALSE]
                for (i in 1:nrow(sig_coeffs)) {
                  cat(sprintf("%s: coeff=%.3f, p=%.3e\n",
                             rownames(sig_coeffs)[i],
                             sig_coeffs[i,1],
                             sig_coeffs[i,4]))
                }
              }
            }
          }
        })
        paste(result, collapse = "\n")
      })

      # Create comprehensive results table
      output$regressionResultsTable <- DT::renderDataTable({
        tryCatch({
          # Calculate correlations between predictors and outcome
          correlations <- sapply(predictors, function(pred) {
            if (pred %in% names(data_for_model) && outcome %in% names(data_for_model)) {
              if (is.numeric(data_for_model[[pred]]) && is.numeric(data_for_model[[outcome]])) {
                cor(data_for_model[[pred]], data_for_model[[outcome]], use = "complete.obs")
              } else {
                # For categorical variables, use eta-squared or Cramér's V
                NA
              }
            } else {
              NA
            }
          })

          # Create results table
          results_table <- data.frame(
            Variable = predictors,
            Correlation = round(correlations, 3),
            stringsAsFactors = FALSE
          )

          # Add coefficients and p-values for linear models
          if (grepl("lm", regression_type) && !grepl("glmnet", regression_type)) {
            coeffs <- model_summary$coefficients
            coeff_df <- data.frame(
              Variable = rownames(coeffs),
              Coefficient = round(coeffs[, 1], 4),
              Std_Error = round(coeffs[, 2], 4),
              P_Value = round(coeffs[, 4], 6),
              Significance = ifelse(coeffs[, 4] < 0.001, "***",
                                   ifelse(coeffs[, 4] < 0.01, "**",
                                         ifelse(coeffs[, 4] < 0.05, "*", ""))),
              stringsAsFactors = FALSE
            )

            # Remove intercept for merging
            coeff_df <- coeff_df[coeff_df$Variable != "(Intercept)", ]

            # Merge with correlations
            results_table <- merge(results_table, coeff_df, by = "Variable", all.x = TRUE)

          } else if (grepl("randomforest", regression_type)) {
            # Add importance scores for Random Forest
            importance_scores <- importance(model)
            if (regression_type == "randomforest_reg") {
              importance_df <- data.frame(
                Variable = rownames(importance_scores),
                Importance_MSE = round(importance_scores[, 1], 3),
                Importance_NodePurity = round(importance_scores[, 2], 3),
                stringsAsFactors = FALSE
              )
            } else {
              importance_df <- data.frame(
                Variable = rownames(importance_scores),
                Importance_Accuracy = round(importance_scores[, ncol(importance_scores)-1], 3),
                Importance_Gini = round(importance_scores[, ncol(importance_scores)], 3),
                stringsAsFactors = FALSE
              )
            }

            # Merge with correlations
            results_table <- merge(results_table, importance_df, by = "Variable", all.x = TRUE)

          } else if (grepl("glmnet", regression_type)) {
            # Add coefficients for Elastic Net
            coeffs <- coef(model, s = "lambda.1se")
            if (is.list(coeffs)) {
              coeffs <- coeffs[[1]]  # Take first class for multinomial
            }

            coeff_df <- data.frame(
              Variable = rownames(coeffs),
              Coefficient = round(as.numeric(coeffs), 4),
              stringsAsFactors = FALSE
            )

            # Remove intercept and zero coefficients
            coeff_df <- coeff_df[coeff_df$Variable != "(Intercept)" & coeff_df$Coefficient != 0, ]

            # Merge with correlations
            results_table <- merge(results_table, coeff_df, by = "Variable", all.x = TRUE)
          }

          # Sort by absolute correlation or importance
          if ("Correlation" %in% names(results_table)) {
            results_table <- results_table[order(abs(results_table$Correlation), decreasing = TRUE), ]
          } else if ("Importance_MSE" %in% names(results_table)) {
            results_table <- results_table[order(results_table$Importance_MSE, decreasing = TRUE), ]
          } else if ("Importance_Gini" %in% names(results_table)) {
            results_table <- results_table[order(results_table$Importance_Gini, decreasing = TRUE), ]
          }

          results_table

        }, error = function(e) {
          data.frame(Error = paste("Could not create results table:", e$message))
        })
      }, options = list(pageLength = 15, scrollX = TRUE))

    }, error = function(e) {
      cat("Regression error:", e$message, "\n")
      output$regressionSummary <- renderText(paste("Error running regression:", e$message))
      output$modelInfo <- renderText("Error: Check that biomarkers are selected")
      output$regressionResultsTable <- DT::renderDataTable(
        data.frame(Error = "Results table not available due to regression error"),
        options = list(pageLength = 5)
      )
    })
  })

  # Regression plots
  output$regressionPlots <- renderPlotly({
    req(values$multi_model)
    req(values$model_data)
    req(values$regression_type)

    tryCatch({
      model <- values$multi_model
      data_to_use <- values$model_data
      regression_type <- values$regression_type

      # Create diagnostic plots with plot_ly directly
      if (grepl("lm", regression_type) || grepl("randomforest_reg", regression_type)) {
        # Residuals vs fitted plot for continuous outcomes
        if (grepl("randomforest", regression_type)) {
          fitted_vals <- predict(model)
          residuals_vals <- data_to_use[[1]] - fitted_vals
        } else {
          fitted_vals <- fitted(model)
          residuals_vals <- residuals(model)
        }

        plot_data <- data.frame(Fitted = fitted_vals, Residuals = residuals_vals)

        plot_ly(plot_data, x = ~Fitted, y = ~Residuals, type = "scatter", mode = "markers",
                marker = list(color = "#3498db", size = 8, opacity = 0.6),
                hovertemplate = "Fitted: %{x:.2f}<br>Residual: %{y:.2f}<extra></extra>") %>%
          add_trace(y = 0, type = "scatter", mode = "lines",
                    line = list(color = "red", dash = "dash"), name = "Zero Line",
                    hoverinfo = "skip") %>%
          layout(xaxis = list(title = "Fitted Values"),
                 yaxis = list(title = "Residuals"),
                 title = paste("Residuals vs Fitted Values<br><sub>Model:", values$method_name, "</sub>"),
                 showlegend = FALSE,
                 hoverlabel = list(bgcolor = "white", bordercolor = "black"))

      } else if (grepl("glm", regression_type) || grepl("randomforest_class", regression_type)) {
        # For classification models
        if (grepl("randomforest", regression_type)) {
          predicted_probs <- predict(model, type = "prob")[,2]
          actual_numeric <- as.numeric(as.factor(data_to_use[[1]])) - 1
        } else {
          predicted_probs <- predict(model, type = "response")
          actual_numeric <- as.numeric(model$y)
        }

        residuals_vals <- actual_numeric - predicted_probs
        plot_data <- data.frame(Predicted_Probability = predicted_probs, Residuals = residuals_vals)

        plot_ly(plot_data, x = ~Predicted_Probability, y = ~Residuals, type = "scatter", mode = "markers",
                marker = list(color = "#e74c3c", size = 8, opacity = 0.6),
                hovertemplate = "Predicted Prob: %{x:.2f}<br>Residual: %{y:.2f}<extra></extra>") %>%
          add_trace(y = 0, type = "scatter", mode = "lines",
                    line = list(color = "red", dash = "dash"), name = "Zero Line",
                    hoverinfo = "skip") %>%
          layout(xaxis = list(title = "Predicted Probability"),
                 yaxis = list(title = "Residuals"),
                 title = paste("Residuals vs Predicted Probabilities<br><sub>Model:", values$method_name, "</sub>"),
                 showlegend = FALSE,
                 hoverlabel = list(bgcolor = "white", bordercolor = "black"))

      } else if (grepl("multinom", regression_type)) {
        # Confusion matrix as heatmap
        predicted_class <- predict(model)
        actual_class <- model$model[[1]]

        confusion_matrix <- table(Predicted = predicted_class, Actual = actual_class)

        plot_ly(z = confusion_matrix,
                x = colnames(confusion_matrix),
                y = rownames(confusion_matrix),
                type = "heatmap",
                colorscale = list(c(0, "white"), c(1, "#3498db")),
                text = confusion_matrix,
                texttemplate = "%{text}",
                hovertemplate = "Actual: %{x}<br>Predicted: %{y}<br>Count: %{z}<extra></extra>",
                colorbar = list(title = "Count")) %>%
          layout(xaxis = list(title = "Actual"),
                 yaxis = list(title = "Predicted"),
                 title = paste("Confusion Matrix<br><sub>Model:", values$method_name, "</sub>"),
                 hoverlabel = list(bgcolor = "white", bordercolor = "black"))

      } else {
        # Default empty plot
        plotly_empty() %>%
          layout(title = list(text = paste("Diagnostic plot not available<br><sub>Model:", values$method_name, "</sub>")))
      }

    }, error = function(e) {
      plotly_empty() %>%
        layout(title = list(text = paste("Error creating plots:", e$message)))
    })
  })

  # ========== TAB 7: IMMUNE PHENOTYPING ==========

  # Reactive values for immune analysis
  immune_filtered_data <- reactive({
    if (is.null(values$combined_data)) return(NULL)

    # Start with combined data (blood + immune info)
    data <- values$combined_data

    # Apply immune-specific filters if they exist
    if (!is.null(input$immune_age_filter) && length(input$immune_age_filter) > 0) {
      data <- data %>% filter(age_group_label %in% input$immune_age_filter)
    }

    if (!is.null(input$immune_gender_filter) && length(input$immune_gender_filter) > 0) {
      data <- data %>% filter(gender_label %in% input$immune_gender_filter)
    }

    return(data)
  }) %>% debounce(DEBOUNCE_MS)  # PHASE 2: Debounce immune filters

  # Update immune cohort summary
  output$immune_cohort_summary <- renderText({
    filtered_data <- immune_filtered_data()

    if (is.null(filtered_data)) {
      return("No data available")
    }

    immune_available <- sum(filtered_data$Immune_Data_Available, na.rm = TRUE)

    paste(
      sprintf("Immune Analysis Cohort:"),
      sprintf("Total participants: %d", nrow(filtered_data)),
      sprintf("With immune data: %d", immune_available),
      sprintf("Males: %d, Females: %d",
              sum(filtered_data$gender_label == "Male", na.rm = TRUE),
              sum(filtered_data$gender_label == "Female", na.rm = TRUE)),
      sep = "\n"
    )
  })

  # Immune filtered data for analysis
  immune_analysis_filtered_data <- reactive({
    req(values$combined_data)

    filtered_data <- values$combined_data

    # Apply immune age filter
    if (!is.null(input$immune_age_filter) && length(input$immune_age_filter) > 0) {
      filtered_data <- filtered_data %>%
        filter(age_group_label %in% input$immune_age_filter)
    }

    # Apply immune gender filter
    if (!is.null(input$immune_gender_filter) && length(input$immune_gender_filter) > 0) {
      filtered_data <- filtered_data %>%
        filter(gender_label %in% input$immune_gender_filter)
    }

    return(filtered_data)
  }) %>% debounce(DEBOUNCE_MS)  # PHASE 2: Debounce immune analysis filters

  # Apply immune filters
  observeEvent(input$apply_immune_filters, {
    filtered_data <- immune_analysis_filtered_data()

    # Update cohort summary
    output$immune_cohort_summary <- renderText({
      paste(
        sprintf("Immune Analysis Cohort:"),
        sprintf("Total participants: %d", nrow(filtered_data)),
        sprintf("Males: %d (%.1f%%)",
                sum(filtered_data$gender_label == "Male", na.rm = TRUE),
                100 * mean(filtered_data$gender_label == "Male", na.rm = TRUE)),
        sprintf("Females: %d (%.1f%%)",
                sum(filtered_data$gender_label == "Female", na.rm = TRUE),
                100 * mean(filtered_data$gender_label == "Female", na.rm = TRUE)),
        sprintf("Age range: %.1f - %.1f years",
                min(filtered_data$Age, na.rm = TRUE),
                max(filtered_data$Age, na.rm = TRUE)),
        sep = "\n"
      )
    })

    # Send data to HTML visualization
    update_html_visualization()
  })

  # Function to update HTML visualization with current settings
  update_html_visualization <- function() {
    # Prepare data to send to HTML visualization
    tryCatch({
      if (!is.null(values$immune_data)) {
        # Process immune data for HTML
        immune_data_for_html <- process_immune_data_for_html()

        # Create JavaScript to update the iframe with simplified approach
        js_code <- sprintf(
          "
          console.log('Executing iframe update from Shiny...');
          var iframe = document.getElementById('immune_tree_iframe');
          console.log('Iframe found:', !!iframe);
          if (iframe && iframe.contentWindow) {
            console.log('Sending postMessage to iframe...');
            iframe.contentWindow.postMessage({
              type: 'update-data',
              data: {
                selectedPanel: '%s',
                selectedMetric: '%s',
                comparisonMode: '%s',
                timestamp: Date.now()
              }
            }, '*');
            console.log('PostMessage sent with data:', {
              selectedPanel: '%s',
              selectedMetric: '%s',
              comparisonMode: '%s'
            });
          } else {
            console.warn('Iframe or contentWindow not available');
          }
          ",
          ifelse(is.null(input$immune_panel_select), "tcells", input$immune_panel_select),
          ifelse(is.null(input$immune_metric_select), "% of Total Cells", input$immune_metric_select),
          ifelse(is.null(input$comparison_mode), "gender", input$comparison_mode),
          ifelse(is.null(input$immune_panel_select), "tcells", input$immune_panel_select),
          ifelse(is.null(input$immune_metric_select), "% of Total Cells", input$immune_metric_select),
          ifelse(is.null(input$comparison_mode), "gender", input$comparison_mode)
        )

        # Send JavaScript to client
        session$sendCustomMessage("updateIframe", js_code)
      }
    }, error = function(e) {
      cat("Error updating HTML visualization:", e$message, "\n")
    })
  }

  # Process immune data for HTML format with demographic analysis
  process_immune_data_for_html <- function() {
    if (is.null(values$immune_data) || is.null(values$combined_data)) return(list())

    html_data <- list()
    filtered_data <- immune_analysis_filtered_data()

    # Get comparison mode
    comparison_mode <- ifelse(is.null(input$comparison_mode), "gender", input$comparison_mode)

    # Process each panel
    for (panel_name in names(values$immune_data)) {
      if (!is.null(values$immune_data[[panel_name]])) {
        panel_data <- values$immune_data[[panel_name]]

        # Merge with demographic data
        merged_data <- panel_data %>%
          left_join(filtered_data %>% select(Participant_ID, age_group_label, gender_label, hba1c_category, Provider),
                   by = "Participant_ID") %>%
          filter(!is.na(age_group_label)) # Only include participants with demographic data

        if (nrow(merged_data) > 0) {
          # Process data for demographic comparison
          processed_rows <- list()

          for (i in 1:nrow(merged_data)) {
            row <- merged_data[i, ]

            # Get comparison groups based on selected mode
            if (comparison_mode == "age") {
              group_var <- row$age_group_label
              comparison_groups <- unique(filtered_data$age_group_label)
            } else if (comparison_mode == "gender") {
              group_var <- row$gender_label
              comparison_groups <- unique(filtered_data$gender_label)
            } else if (comparison_mode == "hba1c") {
              group_var <- row$hba1c_category
              comparison_groups <- unique(filtered_data$hba1c_category[!is.na(filtered_data$hba1c_category)])
            } else {
              group_var <- row$Provider
              comparison_groups <- unique(filtered_data$Provider[!is.na(filtered_data$Provider)])
            }

            # Create demographic comparison data (simplified for visualization)
            demographic_data <- list(
              participant = row$Participant_ID,
              group = group_var,
              comparisonMode = comparison_mode,
              isSignificant = length(comparison_groups) > 1, # Show as significant if there are groups to compare
              foldChange = ifelse(group_var == comparison_groups[1], 1.2, 0.8), # Simple fold change simulation
              pValue = 0.05,
              csvMetric = ifelse(is.null(input$immune_metric_select), "% of Total Cells", input$immune_metric_select)
            )

            processed_rows[[length(processed_rows) + 1]] <- demographic_data
          }

          html_data[[panel_name]] <- processed_rows
        }
      }
    }

    return(html_data)
  }

  # Update visualization when any control changes
  observeEvent(input$immune_panel_select, { update_html_visualization() })
  observeEvent(input$immune_metric_select, { update_html_visualization() })
  observeEvent(input$comparison_mode, { update_html_visualization() })

  # Initialize immune cohort summary and visualization
  observe({
    if (!is.null(values$combined_data)) {
      output$immune_cohort_summary <- renderText({
        data <- values$combined_data
        paste(
          sprintf("Current Immune Cohort:"),
          sprintf("Total participants: %d", nrow(data)),
          sprintf("Males: %d (%.1f%%)",
                  sum(data$gender_label == "Male", na.rm = TRUE),
                  100 * mean(data$gender_label == "Male", na.rm = TRUE)),
          sprintf("Females: %d (%.1f%%)",
                  sum(data$gender_label == "Female", na.rm = TRUE),
                  100 * mean(data$gender_label == "Female", na.rm = TRUE)),
          sprintf("Age range: %.1f - %.1f years",
                  min(data$Age, na.rm = TRUE),
                  max(data$Age, na.rm = TRUE)),
          sep = "\n"
        )
      })

      # Initialize HTML visualization with default settings
      Sys.sleep(1) # Brief delay to ensure iframe is loaded
      update_html_visualization()
    }
  })

  # Immune parameter analysis plot
  output$immune_parameter_plot <- renderPlotly({
    filtered_data <- immune_analysis_filtered_data()

    if (is.null(filtered_data) || is.null(values$immune_processed)) {
      return(plotly_empty() %>% layout(title = "No immune data available"))
    }

    # Get selected panel and comparison mode
    selected_panel <- if(!is.null(input$immune_panel_select)) input$immune_panel_select else "tcells"
    comparison_mode <- if(!is.null(input$comparison_mode)) input$comparison_mode else "gender"

    # Create analysis based on selected panel and comparison
    tryCatch({
      # Convert panel selection to panel name
      panel_names <- c("tcells" = "T Cells", "bcells" = "B Cells",
                      "granulocytes" = "Granulocytes", "dendritic" = "Dendritic Cells")
      selected_panel_name <- panel_names[selected_panel]

      immune_summary <- values$immune_processed %>%
        filter(Panel_Name == selected_panel_name) %>%
        filter(Participant_ID %in% filtered_data$Participant_ID) %>%
        left_join(filtered_data %>% select(Participant_ID, age_group_label, gender_label, hba1c_category, Provider),
                  by = "Participant_ID")

      if (nrow(immune_summary) > 0) {
        # Create plot with plot_ly directly based on comparison mode
        if (comparison_mode == "age") {
          summary_data <- immune_summary %>%
            group_by(age_group_label) %>%
            summarise(Count = n(), .groups = "drop")

          # Blue gradient for age groups
          age_colors <- c('#64B5F6', '#42A5F5', '#2196F3', '#1E88E5', '#1565C0')

          plot_ly(summary_data, x = ~age_group_label, y = ~Count, type = "bar",
                  marker = list(color = age_colors[1:nrow(summary_data)]),
                  hovertemplate = "Age Group: %{x}<br>Count: %{y}<extra></extra>") %>%
            layout(xaxis = list(title = "Age Group", tickangle = 45),
                   yaxis = list(title = "Number of Participants"),
                   title = paste("Immune Data by Age Group -", selected_panel_name),
                   showlegend = FALSE)

        } else if (comparison_mode == "gender") {
          summary_data <- immune_summary %>%
            group_by(gender_label) %>%
            summarise(Count = n(), .groups = "drop")

          plot_ly(summary_data, x = ~gender_label, y = ~Count, type = "bar",
                  marker = list(color = c('#42A5F5', '#EC407A')),
                  hovertemplate = "Gender: %{x}<br>Count: %{y}<extra></extra>") %>%
            layout(xaxis = list(title = "Gender"),
                   yaxis = list(title = "Number of Participants"),
                   title = paste("Immune Data by Gender -", selected_panel_name),
                   showlegend = FALSE)

        } else if (comparison_mode == "hba1c") {
          summary_data <- immune_summary %>%
            group_by(hba1c_category) %>%
            summarise(Count = n(), .groups = "drop") %>%
            filter(!is.na(hba1c_category))

          plot_ly(summary_data, x = ~hba1c_category, y = ~Count, type = "bar",
                  marker = list(color = c('#3498db', '#e74c3c', '#f39c12')),
                  hovertemplate = "Category: %{x}<br>Count: %{y}<extra></extra>") %>%
            layout(xaxis = list(title = "HbA1c Category"),
                   yaxis = list(title = "Number of Participants"),
                   title = paste("Immune Data by HbA1c Category -", selected_panel_name),
                   showlegend = FALSE)

        } else if (comparison_mode == "provider") {
          summary_data <- immune_summary %>%
            group_by(Provider) %>%
            summarise(Count = n(), .groups = "drop") %>%
            filter(!is.na(Provider))

          plot_ly(summary_data, x = ~Provider, y = ~Count, type = "bar",
                  color = ~Provider,
                  hovertemplate = "Provider: %{x}<br>Count: %{y}<extra></extra>") %>%
            layout(xaxis = list(title = "Provider", tickangle = 45),
                   yaxis = list(title = "Number of Participants"),
                   title = paste("Immune Data by Provider -", selected_panel_name),
                   showlegend = FALSE)

        } else {
          summary_data <- immune_summary %>%
            group_by(gender_label) %>%
            summarise(Count = n(), .groups = "drop")

          plot_ly(summary_data, x = ~gender_label, y = ~Count, type = "bar",
                  marker = list(color = c('#42A5F5', '#EC407A')),
                  hovertemplate = "Gender: %{x}<br>Count: %{y}<extra></extra>") %>%
            layout(xaxis = list(title = "Gender"),
                   yaxis = list(title = "Number of Participants"),
                   title = paste("Immune Data by Gender -", selected_panel_name),
                   showlegend = FALSE)
        }
      } else {
        plotly_empty() %>% layout(title = "No data to display for selected filters")
      }
    }, error = function(e) {
      plotly_empty() %>% layout(title = paste("Error:", e$message))
    })
  })

  # Immune statistics table
  output$immune_stats_table <- DT::renderDataTable({
    if (!is.null(values$immune_processed)) {
      values$immune_processed %>%
        group_by(Panel_Name) %>%
        summarise(
          Participants = n_distinct(Participant_ID),
          .groups = "drop"
        )
    } else {
      data.frame(Message = "No immune data loaded")
    }
  }, options = list(pageLength = 5))

  # Immune data preview
  output$immune_data_preview <- DT::renderDataTable({
    if (!is.null(values$immune_processed)) {
      # Show first few rows of immune data
      preview_data <- values$immune_processed %>%
        select(Participant_ID, Panel_Name) %>%
        head(50)

      preview_data
    } else {
      data.frame(Message = "No immune data loaded")
    }
  }, options = list(pageLength = 10, scrollX = TRUE))

}